/**
 * Tests for TUI conversation-session helpers.
 */

import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveRecodeConfigFile, type RecodeConfigFile } from "../config/recode-config.ts";
import { loadHistoryIndex } from "../history/recode-history.ts";
import type { ConversationMessage } from "../messages/message.ts";
import type { RuntimeConfig, RuntimeProviderConfig } from "../runtime/runtime-config.ts";
import {
  createDraftConversation,
  persistConversationSession,
  restoreSavedConversationRuntime
} from "./conversation-session.ts";

const tempRoots: string[] = [];

describe("conversation session helpers", () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot !== undefined) {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  it("creates an in-memory draft conversation without writing history", () => {
    const runtimeConfig = createRuntimeConfig();

    const conversation = createDraftConversation(runtimeConfig, "build");

    expect(conversation.transcript).toEqual([]);
    expect(existsSync(join(tempRoots[0]!, "history"))).toBe(false);
  });

  it("does not persist empty transcripts", () => {
    const runtimeConfig = createRuntimeConfig();
    const historyRoot = join(tempRoots[0]!, "history");

    const conversation = persistConversationSession(
      historyRoot,
      runtimeConfig,
      [],
      undefined,
      "build"
    );

    expect(conversation.transcript).toEqual([]);
    expect(existsSync(historyRoot)).toBe(false);
  });

  it("persists non-empty transcripts and updates the history index", () => {
    const runtimeConfig = createRuntimeConfig();
    const historyRoot = join(tempRoots[0]!, "history");
    const transcript: readonly ConversationMessage[] = [
      {
        role: "user",
        content: "hello"
      }
    ];

    const conversation = persistConversationSession(
      historyRoot,
      runtimeConfig,
      transcript,
      undefined,
      "build"
    );

    const historyIndex = loadHistoryIndex(historyRoot);

    expect(historyIndex.lastConversationId).toBe(conversation.id);
    expect(historyIndex.conversations).toHaveLength(1);
    expect(historyIndex.conversations[0]?.id).toBe(conversation.id);
  });

  it("restores a saved provider/model selection into runtime config", () => {
    const runtimeConfig = createRuntimeConfig({
      providerId: "primary",
      providerName: "Primary",
      model: "gpt-4.1",
      providers: [
        createProvider("primary", "Primary", "gpt-4.1"),
        createProvider("secondary", "Secondary", "claude-3-7")
      ]
    });

    const restored = restoreSavedConversationRuntime(runtimeConfig, {
      providerId: "secondary",
      model: "claude-3-7"
    });

    expect(restored.providerId).toBe("secondary");
    expect(restored.providerName).toBe("Secondary");
    expect(restored.model).toBe("claude-3-7");
  });
});

function createRuntimeConfig(
  overrides: Partial<RuntimeConfig> = {}
): RuntimeConfig {
  const tempRoot = mkdtempSync(join(tmpdir(), "recode-tui-session-"));
  tempRoots.push(tempRoot);

  const configPath = join(tempRoot, "config.json");
  const providers = overrides.providers ?? [createProvider("primary", "Primary", "gpt-4.1")];
  const providerId = overrides.providerId ?? providers[0]?.id ?? "primary";
  const providerName = overrides.providerName ?? providers[0]?.name ?? "Primary";
  const model = overrides.model ?? providers[0]?.defaultModelId ?? "gpt-4.1";

  const config: RecodeConfigFile = {
    version: 1,
    activeProviderId: providerId,
    providers: providers.map(({ source: _source, ...provider }) => provider)
  };
  saveRecodeConfigFile(configPath, config);

  return {
    workspaceRoot: tempRoot,
    configPath,
    provider: "openai",
    providerId,
    providerName,
    model,
    providers,
    approvalMode: "approval",
    approvalAllowlist: [],
    baseUrl: "https://api.openai.com/v1",
    ...overrides
  };
}

function createProvider(
  id: string,
  name: string,
  modelId: string
): RuntimeProviderConfig {
  return {
    id,
    name,
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: [{ id: modelId }],
    defaultModelId: modelId,
    source: "config"
  };
}
