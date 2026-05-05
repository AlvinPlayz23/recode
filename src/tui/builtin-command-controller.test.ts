/**
 * Tests for built-in slash-command dispatch.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import type { AiModel } from "../ai/types.ts";
import type { ContextTokenEstimate } from "../agent/compact-conversation.ts";
import type { SavedConversationRecord } from "../history/recode-history.ts";
import type { RuntimeConfig } from "../runtime/runtime-config.ts";
import type { ConversationMessage } from "../transcript/message.ts";
import type { ContextWindowStatusSnapshot } from "./builtin-command-content.ts";
import {
  dispatchBuiltinCommand,
  type BuiltinCommandDispatchOptions
} from "./builtin-command-controller.ts";
import type { SpinnerPhase } from "./spinner.tsx";
import type { UiEntry } from "./transcript-entry-state.ts";

describe("builtin command controller", () => {
  it("returns normal prompts without clearing the draft", async () => {
    const fixture = createDispatchFixture("hello");

    const result = await dispatchBuiltinCommand(fixture.options);

    expect(result).toEqual({ kind: "not-command", prompt: "hello" });
    expect(fixture.state.draftCleared).toBe(false);
  });

  it("appends built-in help content", async () => {
    const fixture = createDispatchFixture("/help");

    const result = await dispatchBuiltinCommand(fixture.options);

    expect(result).toEqual({ kind: "handled" });
    expect(fixture.state.draftCleared).toBe(true);
    expect(fixture.state.entries[0]?.kind).toBe("assistant");
    expect(fixture.state.entries[0]?.body).toContain("/help");
  });

  it("ignores non-exit commands while busy", async () => {
    const fixture = createDispatchFixture("/help", { busy: true });

    const result = await dispatchBuiltinCommand(fixture.options);

    expect(result).toEqual({ kind: "handled" });
    expect(fixture.state.draftCleared).toBe(false);
    expect(fixture.state.entries).toHaveLength(0);
  });

  it("exits even while busy", async () => {
    const fixture = createDispatchFixture("/exit", { busy: true });

    const result = await dispatchBuiltinCommand(fixture.options);

    expect(result).toEqual({ kind: "handled" });
    expect(fixture.state.draftCleared).toBe(true);
    expect(fixture.state.exited).toBe(true);
  });

  it("starts a new in-memory conversation", async () => {
    const fixture = createDispatchFixture("/new", {
      transcript: [{ role: "user", content: "old" }]
    });

    await dispatchBuiltinCommand(fixture.options);

    expect(fixture.state.previousMessages).toEqual([]);
    expect(fixture.state.entries.map((entry) => [entry.kind, entry.body])).toEqual([
      ["status", "Started a new conversation"]
    ]);
    expect(fixture.state.conversation?.transcript).toEqual([]);
  });

  it("forks the current conversation into a new saved session", async () => {
    const transcript: readonly ConversationMessage[] = [{ role: "user", content: "keep this" }];
    const currentConversation = createSavedConversation("existing-id", transcript);
    const fixture = createDispatchFixture("/fork", {
      transcript,
      currentConversation
    });

    await dispatchBuiltinCommand(fixture.options);

    expect(fixture.state.conversation?.id).not.toBe(currentConversation.id);
    expect(fixture.state.conversation?.transcript).toEqual(transcript);
    expect(fixture.state.previousMessages).toEqual(transcript);
    expect(fixture.state.lastContextEstimate?.estimatedTokens).toBeGreaterThan(0);
    expect(fixture.state.streamingBody).toBe("");
    expect(fixture.state.streamingEntryId).toBeUndefined();
    expect(fixture.state.entries.at(-1)?.body).toContain("Forked conversation into a new session");
  });

  it("does not fork an empty conversation", async () => {
    const fixture = createDispatchFixture("/fork");

    await dispatchBuiltinCommand(fixture.options);

    expect(fixture.state.conversation).toBeUndefined();
    expect(fixture.state.entries.at(-1)?.body).toBe("Nothing to fork yet.");
  });

  it("opens the provider manager", async () => {
    const fixture = createDispatchFixture("/provider");

    await dispatchBuiltinCommand(fixture.options);

    expect(fixture.state.providerPickerOpened).toBe(true);
    expect(fixture.state.draftCleared).toBe(true);
  });

  it("switches session mode and preserves transcript", async () => {
    const transcript: readonly ConversationMessage[] = [{ role: "user", content: "plan this" }];
    const fixture = createDispatchFixture("/plan", { transcript });

    await dispatchBuiltinCommand(fixture.options);

    expect(fixture.state.sessionMode).toBe("plan");
    expect(fixture.state.conversation?.transcript).toEqual(transcript);
    expect(fixture.state.entries.at(-1)?.body).toContain("Switched to PLAN mode");
  });
});

interface FixtureState {
  draftCleared: boolean;
  exited: boolean;
  entries: readonly UiEntry[];
  previousMessages: readonly ConversationMessage[];
  lastContextEstimate: ContextTokenEstimate | undefined;
  conversation: SavedConversationRecord | undefined;
  sessionMode: "build" | "plan";
  minimalMode: boolean;
  busy: boolean;
  busyPhase: SpinnerPhase;
  streamingBody: string;
  streamingEntryId: string | undefined;
  providerPickerOpened: boolean;
}

interface FixtureOverrides {
  readonly busy?: boolean;
  readonly transcript?: readonly ConversationMessage[];
  readonly currentConversation?: SavedConversationRecord;
}

function createDispatchFixture(
  value: string,
  overrides: FixtureOverrides = {}
): { readonly state: FixtureState; readonly options: BuiltinCommandDispatchOptions } {
  const historyRoot = mkdtempSync(join(tmpdir(), "recode-command-history-"));
  const configPath = join(historyRoot, "config.json");
  const transcript = overrides.transcript ?? [];
  const state: FixtureState = {
    draftCleared: false,
    exited: false,
    entries: [],
    previousMessages: transcript,
    lastContextEstimate: undefined,
    conversation: overrides.currentConversation,
    sessionMode: "build",
    minimalMode: false,
    busy: overrides.busy ?? false,
    busyPhase: "thinking",
    streamingBody: "",
    streamingEntryId: undefined,
    providerPickerOpened: false
  };

  const runtimeConfig = createRuntimeConfig(configPath);

  return {
    state,
    options: {
      value,
      busy: state.busy,
      runtimeConfig,
      languageModel: createLanguageModel(runtimeConfig),
      themeName: "senren-dusk",
      toolMarkerName: "arrow",
      sessionMode: state.sessionMode,
      minimalMode: state.minimalMode,
      entriesCount: state.entries.length,
      transcript,
      contextWindowStatus: createContextWindowStatus(),
      historyRoot,
      currentConversation: state.conversation,
      clearPromptDraft() {
        state.draftCleared = true;
      },
      exitApp() {
        state.exited = true;
      },
      focusPrompt() {},
      async openModelPicker() {},
      openProviderPicker() {
        state.providerPickerOpened = true;
      },
      async openHistoryPicker() {},
      openThemePicker() {},
      openCustomizePicker() {},
      openApprovalModePicker() {},
      openLayoutPicker() {},
      setMinimalMode(value_) {
        state.minimalMode = value_;
      },
      setSessionMode(value_) {
        state.sessionMode = value_;
      },
      setConversation(value_) {
        state.conversation = value_;
      },
      setEntries(value_) {
        state.entries = value_;
      },
      setPreviousMessages(value_) {
        state.previousMessages = value_;
      },
      setLastContextEstimate(value_) {
        state.lastContextEstimate = value_;
      },
      setStreamingBody(value_) {
        state.streamingBody = value_;
      },
      setStreamingEntryId(value_) {
        state.streamingEntryId = value_;
      },
      setBusy(value_) {
        state.busy = value_;
      },
      setBusyPhase(value_) {
        state.busyPhase = value_;
      },
      appendEntry(entry) {
        state.entries = [...state.entries, entry];
      }
    }
  };
}

function createSavedConversation(
  id: string,
  transcript: readonly ConversationMessage[]
): SavedConversationRecord {
  return {
    id,
    title: "Existing",
    preview: "Existing preview",
    workspaceRoot: "C:\\workspace",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    providerId: "test-provider",
    providerName: "Test Provider",
    model: "test-model",
    mode: "build",
    messageCount: transcript.length,
    transcript
  };
}

function createRuntimeConfig(configPath: string): RuntimeConfig {
  return {
    workspaceRoot: "C:\\workspace",
    configPath,
    provider: "openai-chat",
    providerId: "test-provider",
    providerName: "Test Provider",
    model: "test-model",
    providers: [
      {
        id: "test-provider",
        name: "Test Provider",
        kind: "openai-chat",
        baseUrl: "https://example.com/v1",
        models: [{ id: "test-model" }],
        defaultModelId: "test-model",
        source: "config"
      }
    ],
    approvalMode: "approval",
    approvalAllowlist: [],
    apiKey: "test",
    baseUrl: "https://example.com/v1"
  };
}

function createLanguageModel(runtimeConfig: RuntimeConfig): AiModel {
  return {
    provider: runtimeConfig.provider,
    providerId: runtimeConfig.providerId,
    providerName: runtimeConfig.providerName,
    modelId: runtimeConfig.model,
    apiKey: runtimeConfig.apiKey ?? "",
    baseUrl: runtimeConfig.baseUrl,
    api: "openai-chat-completions"
  };
}

function createContextWindowStatus(): ContextWindowStatusSnapshot {
  return {
    contextWindowTokens: 200_000,
    source: "fallback",
    reservedTokens: 4096,
    autoCompactionActive: true
  };
}
