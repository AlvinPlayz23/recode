/**
 * Built-in slash-command dispatch for the TUI.
 */

import type { AiModel } from "../ai/types.ts";
import type { SubagentTaskRecord } from "../agent/subagent.ts";
import {
  compactConversation,
  createCompactionSessionSnapshot,
  estimateConversationContextTokens,
  type ContextTokenEstimate
} from "../agent/compact-conversation.ts";
import {
  loadRecodeConfigFile,
  saveRecodeConfigFile,
  selectConfiguredMinimalMode
} from "../config/recode-config.ts";
import { exportConversationToHtml } from "../history/export-html.ts";
import type { SavedConversationRecord } from "../history/recode-history.ts";
import type { RuntimeConfig } from "../runtime/runtime-config.ts";
import type { ConversationMessage } from "../transcript/message.ts";
import {
  buildBuiltinConfigBody,
  buildBuiltinHelpBody,
  buildBuiltinStatusBody,
  type ContextWindowStatusSnapshot
} from "./builtin-command-content.ts";
import {
  createDraftConversation,
  forkConversationSession,
  persistConversationSession
} from "./conversation-session.ts";
import {
  parseBuiltinCommand,
  type BuiltinCommandName
} from "./message-format.ts";
import { getSessionModeLabel, type SessionMode } from "./session-mode.ts";
import type { SpinnerPhase } from "./spinner.tsx";
import type {
  ThemeName,
  ToolMarkerName
} from "./theme.ts";
import {
  createEntry,
  type UiEntry
} from "./transcript-entry-state.ts";

/**
 * Result of slash-command dispatch.
 */
export type BuiltinCommandDispatchResult =
  | {
      readonly kind: "handled";
    }
  | {
      readonly kind: "not-command";
      readonly prompt: string;
    };

/**
 * Callbacks and state needed to execute built-in TUI commands.
 */
export interface BuiltinCommandDispatchOptions {
  readonly value: string;
  readonly busy: boolean;
  readonly runtimeConfig: RuntimeConfig;
  readonly languageModel: AiModel;
  readonly themeName: ThemeName;
  readonly toolMarkerName: ToolMarkerName;
  readonly sessionMode: SessionMode;
  readonly minimalMode: boolean;
  readonly entriesCount: number;
  readonly transcript: readonly ConversationMessage[];
  readonly subagentTasks: readonly SubagentTaskRecord[];
  readonly contextWindowStatus: ContextWindowStatusSnapshot;
  readonly historyRoot: string;
  readonly currentConversation: SavedConversationRecord | undefined;
  readonly clearPromptDraft: () => void;
  readonly exitApp: () => void;
  readonly focusPrompt: () => void;
  readonly openModelPicker: () => Promise<void>;
  readonly openProviderPicker: () => void;
  readonly openHistoryPicker: () => Promise<void>;
  readonly openThemePicker: () => void;
  readonly openCustomizePicker: () => void;
  readonly toggleTodoPanel: () => void;
  readonly openContextWindowPrompt: () => Promise<void>;
  readonly openApprovalModePicker: () => void;
  readonly openLayoutPicker: () => void;
  readonly setMinimalMode: (value: boolean) => void;
  readonly setSessionMode: (value: SessionMode) => void;
  readonly setConversation: (value: SavedConversationRecord) => void;
  readonly setEntries: (value: readonly UiEntry[]) => void;
  readonly setPreviousMessages: (value: readonly ConversationMessage[]) => void;
  readonly setSubagentTasks: (value: readonly SubagentTaskRecord[]) => void;
  readonly setLastContextEstimate: (value: ContextTokenEstimate | undefined) => void;
  readonly setStreamingBody: (value: string) => void;
  readonly setStreamingEntryId: (value: string | undefined) => void;
  readonly setBusy: (value: boolean) => void;
  readonly setBusyPhase: (value: SpinnerPhase) => void;
  readonly appendEntry: (entry: UiEntry) => void;
}

/**
 * Parse and execute a built-in command. Non-command prompts are returned to the caller.
 */
export async function dispatchBuiltinCommand(
  options: BuiltinCommandDispatchOptions
): Promise<BuiltinCommandDispatchResult> {
  const prompt = options.value.trim();
  const builtinCommand = parseBuiltinCommand(prompt);

  if (prompt === "" || prompt === "/") {
    return { kind: "handled" };
  }

  if (builtinCommand?.name === "exit" || builtinCommand?.name === "quit") {
    options.clearPromptDraft();
    options.exitApp();
    return { kind: "handled" };
  }

  if (options.busy) {
    return { kind: "handled" };
  }

  if (builtinCommand === undefined) {
    return { kind: "not-command", prompt };
  }

  options.clearPromptDraft();
  await executeBuiltinCommand(builtinCommand.name, options);
  return { kind: "handled" };
}

async function executeBuiltinCommand(
  commandName: BuiltinCommandName,
  options: BuiltinCommandDispatchOptions
): Promise<void> {
  switch (commandName) {
    case "models":
      await options.openModelPicker();
      return;
    case "provider":
      options.openProviderPicker();
      return;
    case "history":
      await options.openHistoryPicker();
      return;
    case "theme":
      options.openThemePicker();
      return;
    case "customize":
      options.openCustomizePicker();
      return;
    case "todos":
      options.toggleTodoPanel();
      return;
    case "context-window":
      await options.openContextWindowPrompt();
      return;
    case "approval-mode":
      options.openApprovalModePicker();
      return;
    case "layout":
      options.openLayoutPicker();
      return;
    case "minimal":
      toggleMinimalMode(options);
      return;
    case "export":
      exportCurrentConversation(options);
      return;
    case "new":
    case "clear":
      startNewConversation(options);
      return;
    case "fork":
      forkCurrentConversation(options);
      return;
    case "compact":
      await compactCurrentConversation(options);
      return;
    case "plan":
    case "build":
      switchSessionMode(commandName, options);
      return;
    case "help":
    case "status":
    case "config":
      appendStaticBuiltinCommand(commandName, options);
      return;
    case "exit":
    case "quit":
      return;
  }
}

function appendStaticBuiltinCommand(
  commandName: "help" | "status" | "config",
  options: BuiltinCommandDispatchOptions
): void {
  switch (commandName) {
    case "help":
      options.appendEntry(createEntry("assistant", "Recode", buildBuiltinHelpBody()));
      return;
    case "status":
      options.appendEntry(createEntry(
        "assistant",
        "Recode",
        buildBuiltinStatusBody(
          options.runtimeConfig,
          options.toolMarkerName,
          options.sessionMode,
          options.entriesCount,
          options.transcript.length,
          options.transcript,
          options.contextWindowStatus
        )
      ));
      return;
    case "config":
      options.appendEntry(createEntry(
        "assistant",
        "Recode",
        buildBuiltinConfigBody(options.runtimeConfig, options.themeName, options.toolMarkerName)
      ));
      return;
  }
}

function toggleMinimalMode(options: BuiltinCommandDispatchOptions): void {
  const next = !options.minimalMode;
  options.setMinimalMode(next);
  try {
    persistMinimalMode(options.runtimeConfig.configPath, next);
  } catch {
    // Non-critical: the toggle still takes effect for the current session.
  }
  options.appendEntry(
    createEntry("status", "status", next ? "Minimal mode enabled — header hidden" : "Minimal mode disabled — header visible")
  );
}

function exportCurrentConversation(options: BuiltinCommandDispatchOptions): void {
  if (options.currentConversation === undefined) {
    options.appendEntry(createEntry("error", "error", "There is no active conversation to export."));
    return;
  }

  try {
    const outputPath = exportConversationToHtml({
      workspaceRoot: options.runtimeConfig.workspaceRoot,
      conversation: options.currentConversation,
      themeName: options.themeName
    });
    options.appendEntry(createEntry("status", "status", `Exported conversation to ${outputPath}`));
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
  }
}

function startNewConversation(options: BuiltinCommandDispatchOptions): void {
  const conversation = createDraftConversation(options.runtimeConfig, options.sessionMode);
  options.setConversation(conversation);
  options.setEntries([createEntry("status", "status", "Started a new conversation")]);
  options.setPreviousMessages([]);
  options.setSubagentTasks([]);
  options.setLastContextEstimate(undefined);
  options.setStreamingBody("");
  options.setStreamingEntryId(undefined);
}

function forkCurrentConversation(options: BuiltinCommandDispatchOptions): void {
  if (options.transcript.length === 0) {
    options.appendEntry(createEntry("status", "status", "Nothing to fork yet."));
    return;
  }

  const forkedConversation = forkConversationSession(
    options.historyRoot,
    options.runtimeConfig,
    options.transcript,
    options.sessionMode,
    options.subagentTasks,
    options.currentConversation?.sessionSnapshots
  );

  options.setConversation(forkedConversation);
  options.setPreviousMessages(forkedConversation.transcript);
  options.setSubagentTasks(forkedConversation.subagentTasks ?? []);
  options.setLastContextEstimate(estimateConversationContextTokens(forkedConversation.transcript));
  options.setStreamingBody("");
  options.setStreamingEntryId(undefined);
  options.appendEntry(
    createEntry(
      "status",
      "status",
      `Forked conversation into a new session (${forkedConversation.id.slice(0, 8)})`
    )
  );
}

async function compactCurrentConversation(options: BuiltinCommandDispatchOptions): Promise<void> {
  options.setBusyPhase("thinking");
  options.setBusy(true);

  try {
    const compacted = await compactConversation({
      transcript: options.transcript,
      languageModel: options.languageModel
    });

    if (compacted.kind === "noop") {
      options.appendEntry(createEntry("status", "status", "Nothing to compact yet."));
      return;
    }

    options.setPreviousMessages(compacted.transcript);
    options.setLastContextEstimate(estimateConversationContextTokens(compacted.transcript));
    const snapshot = createCompactionSessionSnapshot(options.transcript, compacted, "manual");
    const nextSnapshots = [...(options.currentConversation?.sessionSnapshots ?? []), snapshot];
    const persistedConversation = persistConversationSession(
      options.historyRoot,
      options.runtimeConfig,
      compacted.transcript,
      options.currentConversation,
      options.sessionMode,
      options.subagentTasks,
      nextSnapshots
    );
    options.setConversation(persistedConversation);
    options.appendEntry(
      createEntry(
        "status",
        "status",
        `Compacted ${compacted.compactedMessageCount} older message${compacted.compactedMessageCount === 1 ? "" : "s"} into a continuation summary`
      )
    );
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
  } finally {
    options.setBusyPhase("thinking");
    options.setBusy(false);
    options.focusPrompt();
  }
}

function switchSessionMode(
  nextMode: SessionMode,
  options: BuiltinCommandDispatchOptions
): void {
  if (options.sessionMode === nextMode) {
    options.appendEntry(createEntry("status", "status", `Already in ${getSessionModeLabel(nextMode)} mode`));
    return;
  }

  options.setSessionMode(nextMode);
  const persistedConversation = persistConversationSession(
    options.historyRoot,
    options.runtimeConfig,
    options.transcript,
    options.currentConversation,
    nextMode,
    options.subagentTasks
  );
  options.setConversation(persistedConversation);
  options.appendEntry(
    createEntry(
      "status",
      "status",
      nextMode === "plan"
        ? "Switched to PLAN mode — Recode will clarify and plan without editing files"
        : "Switched to BUILD mode — Recode can implement changes again"
    )
  );
}

function persistMinimalMode(configPath: string, enabled: boolean): void {
  const config = loadRecodeConfigFile(configPath);
  const nextConfig = selectConfiguredMinimalMode(config, enabled);
  saveRecodeConfigFile(configPath, nextConfig);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
