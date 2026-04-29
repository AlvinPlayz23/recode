/**
 * Tests for persistent Recode config helpers.
 *
 * @author dev
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  createEmptyConfig,
  loadRecodeConfigFile,
  resolveConfigPath,
  saveRecodeConfigFile,
  selectConfiguredApprovalAllowlist,
  selectConfiguredApprovalMode,
  selectConfiguredProviderModel,
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
        models: [{ id: "gpt-4.1" }],
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

  it("updates the configured theme", () => {
    const config = selectConfiguredTheme(createEmptyConfig(), "paper-lantern");
    expect(config.themeName).toBe("paper-lantern");
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
});
