/**
 * Tests for persistent Recode config helpers.
 *
 * @author dev
 */

import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  createEmptyConfig,
  loadRecodeConfigFile,
  resolveConfigPath,
  saveRecodeConfigFile,
  selectConfiguredApprovalAllowlist,
  selectConfiguredApprovalMode,
  selectConfiguredLayoutMode,
  selectConfiguredMinimalMode,
  setConfiguredModelContextWindow,
  selectConfiguredProviderModel,
  setConfiguredProviderDisabled,
  selectConfiguredTheme,
  selectConfiguredToolMarker,
  upsertConfiguredProvider
} from "./recode-config.ts";

describe("recode config", () => {
  it("uses a user-home default config path", () => {
    expect(resolveConfigPath("/workspace")).toBe(resolve(homedir(), ".recode", "config.json"));
  });

  it("expands a tilde-prefixed override path", () => {
    expect(resolveConfigPath("/workspace", "~/.recode/custom.json")).toBe(resolve(homedir(), ".recode", "custom.json"));
  });

  it("returns an empty config when the file is missing", () => {
    const config = loadRecodeConfigFile(join(tmpdir(), "definitely-missing-recode-config.json"));
    expect(config).toEqual(createEmptyConfig());
  });

  it("saves and reloads configured providers", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "recode-config-"));
    const configPath = resolveConfigPath(workspaceRoot, ".recode/config.json");
    const nextConfig = upsertConfiguredProvider(
      createEmptyConfig(),
      {
        id: "openai-main",
        name: "OpenAI Main",
        kind: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        headers: { "x-test": "yes" },
        options: { timeoutMs: 1000, provider: { sort: "throughput" } },
        models: [{ id: "gpt-4.1", contextWindowTokens: 128000 }],
        defaultModelId: "gpt-4.1"
      },
      true
    );
    const themedConfig = selectConfiguredTheme(nextConfig, "matcha-night");
    const markerConfig = selectConfiguredToolMarker(themedConfig, "triangle");
    const approvalConfig = selectConfiguredApprovalAllowlist(
      selectConfiguredApprovalMode(markerConfig, "auto-edits"),
      ["edit"]
    );

    saveRecodeConfigFile(configPath, approvalConfig);

    const rawText = readFileSync(configPath, "utf8");
    expect(rawText).toContain("\"openai-main\"");
    expect(rawText).toContain("\"matcha-night\"");
    expect(rawText).toContain("\"triangle\"");
    expect(rawText).toContain("\"auto-edits\"");

    expect(loadRecodeConfigFile(configPath)).toEqual(approvalConfig);
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

  it("normalizes provider kind aliases while loading config", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "recode-config-"));
    const configPath = resolveConfigPath(workspaceRoot, ".recode/config.json");
    const rawConfig = {
      version: 1,
      activeProviderId: "glm",
      providers: [
        {
          id: "glm",
          name: "GLM",
          kind: "glm",
          baseUrl: "https://api.z.ai/api/paas/v4",
          models: [{ id: "glm-5" }]
        }
      ]
    };

    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(rawConfig, null, 2)}\n`, "utf8");

    const config = loadRecodeConfigFile(configPath);
    expect(config.providers[0]?.kind).toBe("z-ai");
  });

  it("stores provider disabled state", () => {
    const config = setConfiguredProviderDisabled(
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
      true
    );

    expect(config.providers[0]?.disabled).toBe(true);
    expect(setConfiguredProviderDisabled(config, "openai", false).providers[0]?.disabled).toBeUndefined();
  });

  it("stores context-window metadata per model", () => {
    const config = setConfiguredModelContextWindow(
      {
        version: 1,
        activeProviderId: "openai",
        providers: [
          {
            id: "openai",
            name: "OpenAI",
            kind: "openai",
            baseUrl: "https://api.openai.com/v1",
            models: [{ id: "gpt-4.1-mini" }]
          }
        ]
      },
      "openai",
      "gpt-4.1-mini",
      128000
    );

    expect(config.providers[0]?.models).toContainEqual({
      id: "gpt-4.1-mini",
      contextWindowTokens: 128000
    });
  });

  it("updates the configured theme", () => {
    const config = selectConfiguredTheme(createEmptyConfig(), "frost-glass");
    expect(config.themeName).toBe("frost-glass");
  });

  it("updates the configured tool marker", () => {
    const config = selectConfiguredToolMarker(createEmptyConfig(), "hook");
    expect(config.toolMarkerName).toBe("hook");
  });

  it("updates approval settings", () => {
    const modeConfig = selectConfiguredApprovalMode(createEmptyConfig(), "yolo");
    const allowlistConfig = selectConfiguredApprovalAllowlist(modeConfig, ["bash"]);

    expect(allowlistConfig.approvalMode).toBe("yolo");
    expect(allowlistConfig.approvalAllowlist).toEqual(["bash"]);
  });

  it("preserves unrelated settings across config selectors", () => {
    const config = selectConfiguredToolMarker(
      selectConfiguredMinimalMode(
        selectConfiguredLayoutMode(
          selectConfiguredApprovalMode(
            selectConfiguredTheme(createEmptyConfig(), "frost-glass"),
            "auto-edits"
          ),
          "comfortable"
        ),
        true
      ),
      "triangle"
    );

    const nextConfig = selectConfiguredProviderModel(
      upsertConfiguredProvider(
        config,
        {
          id: "openai",
          name: "OpenAI",
          kind: "openai",
          baseUrl: "https://api.openai.com/v1",
          models: [{ id: "gpt-4.1" }]
        },
        true
      ),
      "openai",
      "gpt-4.1-mini"
    );

    expect(nextConfig.themeName).toBe("frost-glass");
    expect(nextConfig.approvalMode).toBe("auto-edits");
    expect(nextConfig.layoutMode).toBe("comfortable");
    expect(nextConfig.minimalMode).toBe(true);
    expect(nextConfig.toolMarkerName).toBe("triangle");
  });
});
