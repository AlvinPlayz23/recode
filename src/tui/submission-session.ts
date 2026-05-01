/**
 * Submission/session orchestration helpers for TUI prompt runs.
 */

import { estimateConversationContextTokens, type ContextTokenEstimate } from "../agent/compact-conversation.ts";
import type { RuntimeConfig } from "../runtime/runtime-config.ts";
import type { SavedConversationRecord } from "../history/recode-history.ts";
import type { ConversationMessage, ToolCall } from "../transcript/message.ts";
import { persistConversationSession } from "./conversation-session.ts";
import type { SessionMode } from "./session-mode.ts";
import {
  appendEntry,
  createEntry,
  formatToolCallEntry,
  type SetUiEntries,
  type UiEntry
} from "./transcript-entry-state.ts";

/**
 * Options for persisting the transcript state produced by a prompt run.
 */
export interface PersistPromptTranscriptOptions {
  readonly historyRoot: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly transcript: readonly ConversationMessage[];
  readonly currentConversation: SavedConversationRecord | undefined;
  readonly sessionMode: SessionMode;
  readonly setPreviousMessages: (value: readonly ConversationMessage[]) => void;
  readonly setLastContextEstimate: (value: ContextTokenEstimate) => void;
  readonly setConversation: (value: SavedConversationRecord) => void;
}

/**
 * Options for converting one tool call into transcript entries.
 */
export interface AppendToolCallEntryOptions {
  readonly currentStreamingId: string | undefined;
  readonly currentStreamingBody: string;
  readonly toolCall: ToolCall;
  readonly setEntries: SetUiEntries;
}

/**
 * Persist the current prompt-run transcript and update session state consistently.
 */
export function persistPromptTranscript(options: PersistPromptTranscriptOptions): SavedConversationRecord {
  options.setPreviousMessages(options.transcript);
  options.setLastContextEstimate(estimateConversationContextTokens(options.transcript));
  const persistedConversation = persistConversationSession(
    options.historyRoot,
    options.runtimeConfig,
    options.transcript,
    options.currentConversation,
    options.sessionMode
  );
  options.setConversation(persistedConversation);
  return persistedConversation;
}

/**
 * Convert a tool call into a visible tool entry and create the next assistant placeholder.
 */
export function appendToolCallEntryAndCreateAssistantPlaceholder(
  options: AppendToolCallEntryOptions
): UiEntry | undefined {
  const currentId = options.currentStreamingId;
  if (currentId === undefined) {
    return undefined;
  }

  const currentBody = options.currentStreamingBody;
  const toolEntry = createEntry("tool", "tool", formatToolCallEntry(options.toolCall));

  options.setEntries((previous) => {
    const current = previous.find((entry) => entry.id === currentId);
    const updatedPrevious = currentBody === ""
      ? previous
      : previous.map((entry) => entry.id === currentId ? { ...entry, body: currentBody } : entry);

    if (current !== undefined && current.body === "" && currentBody === "") {
      return [...updatedPrevious.filter((entry) => entry.id !== currentId), toolEntry];
    }

    return [...updatedPrevious, toolEntry];
  });

  const nextEntry = createEntry("assistant", "Recode", "");
  appendEntry(options.setEntries, nextEntry);
  return nextEntry;
}

/**
 * Finalize or remove the last assistant placeholder after a prompt run finishes.
 */
export function finalizeAssistantStreamEntry(
  setEntries: SetUiEntries,
  entryId: string | undefined,
  finalBody: string
): void {
  if (entryId === undefined) {
    return;
  }

  setEntries((previous) => {
    const last = previous.find((entry) => entry.id === entryId);
    if (last === undefined) {
      return previous;
    }
    if (finalBody !== "") {
      return previous.map((entry) => entry.id === entryId ? { ...entry, body: finalBody } : entry);
    }
    if (last.body === "") {
      return previous.filter((entry) => entry.id !== entryId);
    }
    return previous;
  });
}
