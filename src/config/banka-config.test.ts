/**
 * Tests for persistent Banka config helpers.
 *
 * @author dev
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  createEmptyConfig,
  loadBankaConfigFile,
  resolveConfigPath,
  saveBankaConfigFile,
  selectConfiguredProviderModel,
  upsertConfiguredProvider
} from "./banka-config.ts";

describe("banka config", () => {
  it("uses a workspace-local default config path", () => {
    expect(resolveConfigPath("/workspace")).toBe(resolve("/workspace", ".recode", "config.json"));
  });

  it("returns an empty config when the file is missing", () => {
    const config = loadBankaConfigFile(join(tmpdir(), "definitely-missing-banka-config.json"));
    expect(config).toEqual(createEmptyConfig());
  });

  it("saves and reloads configured providers", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "banka-config-"));
    const configPath = resolveConfigPath(workspaceRoot);
    const nextConfig = upsertConfiguredProvider(
      createEmptyConfig(),
      {
        id: "openai-main",
        name: "OpenAI Main",
        kind: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        models: [{ id: "gpt-4.1" }],
        defaultModelId: "gpt-4.1"
      },
      true
    );

    saveBankaConfigFile(configPath, nextConfig);

    const rawText = readFileSync(configPath, "utf8");
    expect(rawText).toContain("\"openai-main\"");

    expect(loadBankaConfigFile(configPath)).toEqual(nextConfig);
  });

  it("updates the active provider and selected model", () => {
    const config = selectConfiguredProviderModel(
      {
        version: 1,
        activeProviderId: "openai",
        providers: [
          {
            id: "openai",
            name: "OpenAI",
            kind: "openai",
            baseUrl: "https://api.openai.com/v1",
            models: [{ id: "gpt-4.1" }]
          }
        ]
      },
      "openai",
      "gpt-4.1-mini"
    );

    expect(config.activeProviderId).toBe("openai");
    expect(config.providers[0]?.defaultModelId).toBe("gpt-4.1-mini");
    expect(config.providers[0]?.models).toContainEqual({ id: "gpt-4.1-mini" });
  });
});
