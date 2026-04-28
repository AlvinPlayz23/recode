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
        BANKA_PROVIDER: "openai",
        BANKA_API_KEY: "sk-test",
        BANKA_BASE_URL: "https://api.openai.com/v1",
        BANKA_MODEL: "gpt-4"
      },
      () => {
        const config = loadRuntimeConfig("/workspace");

        expect(config.provider).toBe("openai");
        expect(config.providerId).toBe("active");
        expect(config.providerName).toBe("OpenAI-Compatible");
        expect(config.apiKey).toBe("sk-test");
        expect(config.baseUrl).toBe("https://api.openai.com/v1");
        expect(config.model).toBe("gpt-4");
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
          models: [{ id: "openai/gpt-4.1-mini" }],
          defaultModelId: "openai/gpt-4.1-mini"
        }
      ]
    });

    withEnv({}, () => {
      const config = loadRuntimeConfig(workspaceRoot);

      expect(config.provider).toBe("openai-chat");
      expect(config.providerId).toBe("openrouter");
      expect(config.providerName).toBe("OpenRouter");
      expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(config.apiKey).toBe("or-key");
      expect(config.model).toBe("openai/gpt-4.1-mini");
      expect(config.providers).toHaveLength(1);
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
        BANKA_CONFIG_PATH: ".recode/config.json",
        BANKA_PROVIDER: "openai",
        BANKA_BASE_URL: "https://api.openai.com/v1",
        BANKA_MODEL: "gpt-4.1"
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

  it("allows missing API keys for endpoints that do not require them", () => {
    withEnv(
      {
        BANKA_PROVIDER: "openai-chat",
        BANKA_BASE_URL: "http://127.0.0.1:11434/v1",
        BANKA_MODEL: "qwen3:8b"
      },
      () => {
        const config = loadRuntimeConfig("/workspace");
        expect(config.apiKey).toBeUndefined();
      }
    );
  });

  it("throws when no model can be resolved", () => {
    withEnv(
      { BANKA_PROVIDER: "openai", BANKA_BASE_URL: "https://api.openai.com/v1" },
      () => {
        expect(() => loadRuntimeConfig("/workspace")).toThrow("Missing model ID");
      }
    );
  });

  it("throws when no base URL can be resolved", () => {
    withEnv(
      { BANKA_PROVIDER: "openai", BANKA_MODEL: "gpt-4.1" },
      () => {
        expect(() => loadRuntimeConfig("/workspace")).toThrow("Missing provider base URL");
      }
    );
  });
});

interface EnvOverrides {
  readonly BANKA_CONFIG_PATH?: string;
  readonly BANKA_ACTIVE_PROVIDER?: string;
  readonly BANKA_PROVIDER?: string;
  readonly BANKA_API_KEY?: string;
  readonly BANKA_BASE_URL?: string;
  readonly BANKA_MODEL?: string;
}

function withEnv(overrides: EnvOverrides, fn: () => void): void {
  const keys = [
    "BANKA_CONFIG_PATH",
    "BANKA_ACTIVE_PROVIDER",
    "BANKA_PROVIDER",
    "BANKA_API_KEY",
    "BANKA_BASE_URL",
    "BANKA_MODEL"
  ] as const;
  const originals = new Map<string, string | undefined>();

  for (const key of keys) {
    originals.set(key, Bun.env[key]);
  }

  try {
    for (const key of keys) {
      delete Bun.env[key];
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
  const workspaceRoot = mkdtempSync(join(tmpdir(), "banka-runtime-config-"));
  const configDir = join(workspaceRoot, ".recode");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "config.json"), `${JSON.stringify({ version: 1, ...config }, null, 2)}\n`, "utf8");
  return workspaceRoot;
}
