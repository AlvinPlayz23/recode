/**
 * Runtime config loader tests.
 *
 * @author dev
 */

import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadRuntimeConfig } from "./runtime-config.ts";

describe("loadRuntimeConfig", () => {
  it("loads config from environment variables", () => {
    withEnv(
      {
        RECODE_PROVIDER: "openai",
        RECODE_API_KEY: "sk-test",
        RECODE_BASE_URL: "https://api.openai.com/v1",
        RECODE_MODEL: "gpt-4",
        RECODE_MAX_OUTPUT_TOKENS: "4096",
        RECODE_TEMPERATURE: "0.3",
        RECODE_TOOL_CHOICE: "required"
      },
      () => {
        const config = loadRuntimeConfig("/workspace");

        expect(config.provider).toBe("openai");
        expect(config.providerId).toBe("active");
        expect(config.providerName).toBe("OpenAI-Compatible");
        expect(config.apiKey).toBe("sk-test");
        expect(config.baseUrl).toBe("https://api.openai.com/v1");
        expect(config.model).toBe("gpt-4");
        expect(config.maxOutputTokens).toBe(4096);
        expect(config.temperature).toBe(0.3);
        expect(config.toolChoice).toBe("required");
      }
    );
  });

  it("loads provider config from the local config file", () => {
    const workspaceRoot = createWorkspaceWithConfig({
      activeProviderId: "openrouter",
      providers: [
        {
          id: "openrouter",
          name: "OpenRouter",
          kind: "openai-chat",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "or-key",
          models: [{ id: "openai/gpt-4.1-mini", contextWindowTokens: 128000 }],
          defaultModelId: "openai/gpt-4.1-mini",
          maxOutputTokens: 1024,
          temperature: 0.1,
          toolChoice: "auto"
        }
      ]
    });

    withEnv({ RECODE_CONFIG_PATH: ".recode/config.json" }, () => {
      const config = loadRuntimeConfig(workspaceRoot);

      expect(config.provider).toBe("openai-chat");
      expect(config.providerId).toBe("openrouter");
      expect(config.providerName).toBe("OpenRouter");
      expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(config.apiKey).toBe("or-key");
      expect(config.model).toBe("openai/gpt-4.1-mini");
      expect(config.providers).toHaveLength(1);
      expect(config.maxOutputTokens).toBe(1024);
      expect(config.temperature).toBe(0.1);
      expect(config.toolChoice).toBe("auto");
      expect(config.contextWindowTokens).toBe(128000);
    });
  });

  it("lets environment variables override the active configured provider", () => {
    const workspaceRoot = createWorkspaceWithConfig({
      activeProviderId: "ollama",
      providers: [
        {
          id: "ollama",
          name: "Local Ollama",
          kind: "openai-chat",
          baseUrl: "http://127.0.0.1:11434/v1",
          models: [{ id: "qwen3:8b" }],
          defaultModelId: "qwen3:8b"
        }
      ]
    });

    withEnv(
      {
        RECODE_CONFIG_PATH: ".recode/config.json",
        RECODE_PROVIDER: "openai",
        RECODE_BASE_URL: "https://api.openai.com/v1",
        RECODE_MODEL: "gpt-4.1"
      },
      () => {
        const config = loadRuntimeConfig(workspaceRoot);

        expect(config.provider).toBe("openai");
        expect(config.baseUrl).toBe("https://api.openai.com/v1");
        expect(config.model).toBe("gpt-4.1");
        expect(config.providers[0]?.source).toBe("env");
      }
    );
  });

  it("applies environment-only tuning overrides to provider metadata", () => {
    const workspaceRoot = createWorkspaceWithConfig({
      activeProviderId: "openrouter",
      providers: [
        {
          id: "openrouter",
          name: "OpenRouter",
          kind: "openai-chat",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "or-key",
          models: [{ id: "openai/gpt-4.1-mini" }],
          defaultModelId: "openai/gpt-4.1-mini",
          maxOutputTokens: 1024,
          temperature: 0.1,
          toolChoice: "auto"
        }
      ]
    });

    withEnv(
      {
        RECODE_CONFIG_PATH: ".recode/config.json",
        RECODE_MAX_OUTPUT_TOKENS: "4096",
        RECODE_TEMPERATURE: "0.3",
        RECODE_TOOL_CHOICE: "required"
      },
      () => {
        const config = loadRuntimeConfig(workspaceRoot);
        const provider = config.providers[0];

        expect(config.maxOutputTokens).toBe(4096);
        expect(config.temperature).toBe(0.3);
        expect(config.toolChoice).toBe("required");
        expect(provider?.source).toBe("env");
        expect(provider?.maxOutputTokens).toBe(4096);
        expect(provider?.temperature).toBe(0.3);
        expect(provider?.toolChoice).toBe("required");
        expect(provider?.apiKey).toBe("or-key");
      }
    );
  });

  it("allows missing API keys for endpoints that do not require them", () => {
    withEnv(
      {
        RECODE_PROVIDER: "openai-chat",
        RECODE_BASE_URL: "http://127.0.0.1:11434/v1",
        RECODE_MODEL: "qwen3:8b"
      },
      () => {
        const config = loadRuntimeConfig("/workspace");
        expect(config.apiKey).toBeUndefined();
      }
    );
  });

  it("throws when no model can be resolved", () => {
    withEnv(
      { RECODE_PROVIDER: "openai", RECODE_BASE_URL: "https://api.openai.com/v1" },
      () => {
        expect(() => loadRuntimeConfig("/workspace")).toThrow("Missing model ID");
      }
    );
  });

  it("throws when no base URL can be resolved", () => {
    withEnv(
      { RECODE_PROVIDER: "openai", RECODE_MODEL: "gpt-4.1" },
      () => {
        expect(() => loadRuntimeConfig("/workspace")).toThrow("Missing provider base URL");
      }
    );
  });
});

interface EnvOverrides {
  readonly RECODE_CONFIG_PATH?: string;
  readonly RECODE_ACTIVE_PROVIDER?: string;
  readonly RECODE_PROVIDER?: string;
  readonly RECODE_API_KEY?: string;
  readonly RECODE_BASE_URL?: string;
  readonly RECODE_MODEL?: string;
  readonly RECODE_MAX_OUTPUT_TOKENS?: string;
  readonly RECODE_TEMPERATURE?: string;
  readonly RECODE_TOOL_CHOICE?: string;
}

function withEnv(overrides: EnvOverrides, fn: () => void): void {
  const keys = [
    "RECODE_CONFIG_PATH",
    "RECODE_ACTIVE_PROVIDER",
    "RECODE_PROVIDER",
    "RECODE_API_KEY",
    "RECODE_BASE_URL",
    "RECODE_MODEL",
    "RECODE_MAX_OUTPUT_TOKENS",
    "RECODE_TEMPERATURE",
    "RECODE_TOOL_CHOICE"
  ] as const;
  const originals = new Map<string, string | undefined>();

  for (const key of keys) {
    originals.set(key, Bun.env[key]);
  }

  try {
    for (const key of keys) {
      delete Bun.env[key];
    }

    if (overrides.RECODE_CONFIG_PATH === undefined) {
      Bun.env.RECODE_CONFIG_PATH = join(
        tmpdir(),
        `recode-runtime-config-${Math.random().toString(36).slice(2)}.json`
      );
    }

    for (const [key, value] of Object.entries(overrides)) {
      Bun.env[key] = value;
    }

    fn();
  } finally {
    for (const key of keys) {
      const original = originals.get(key);
      if (original === undefined) {
        delete Bun.env[key];
      } else {
        Bun.env[key] = original;
      }
    }
  }
}

function createWorkspaceWithConfig(config: Record<string, unknown>): string {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "recode-runtime-config-"));
  const configDir = join(workspaceRoot, ".recode");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "config.json"), `${JSON.stringify({ version: 1, ...config }, null, 2)}\n`, "utf8");
  return workspaceRoot;
}
