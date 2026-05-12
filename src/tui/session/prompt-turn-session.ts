/**
 * Per-turn session projection helpers for prompt runs.
 */

import { estimateConversationContextTokens, type ContextTokenEstimate } from "../../agent/compact-conversation.ts";
import type { SessionEvent } from "../../session/session-event.ts";
import {
  applySessionEvent,
  createEmptySessionState,
  type SessionState
} from "../../session/session-state.ts";
import type { ConversationMessage } from "../../transcript/message.ts";
import type { TodoItem } from "../../tools/tool.ts";
import {
  uiEntriesFromSessionState,
  type SetUiEntries,
  type UiEntry
} from "../transcript/transcript-entry-state.ts";
import { buildPromptTranscriptSnapshot } from "./submission-session.ts";
import type { SpinnerPhase } from "../appearance/spinner.tsx";

/** Options for one prompt turn session projector. */
export interface PromptTurnSessionOptions {
  readonly baseEntries: readonly UiEntry[];
  readonly baseSessionEvents: readonly SessionEvent[];
  readonly workspaceRoot: string;
  readonly setEntries: SetUiEntries;
  readonly setSessionEvents: (value: readonly SessionEvent[]) => void;
  readonly setBusyPhase: (value: SpinnerPhase) => void;
  readonly getBusyPhase: () => SpinnerPhase;
  readonly setProviderStatusText: (value: string | undefined) => void;
  readonly invalidateWorkspaceFileSuggestions: (workspaceRoot: string) => void;
  readonly bumpFileSuggestionVersion: () => void;
  readonly setTodos: (value: readonly TodoItem[]) => void;
  readonly closeTodoDropup: () => void;
  readonly setTranscriptMessages: (value: readonly ConversationMessage[]) => void;
  readonly setLastContextEstimate: (value: ContextTokenEstimate) => void;
}

/** Mutable controller for the current prompt turn. */
export interface PromptTurnSession {
  readonly handleSessionEvent: (event: SessionEvent) => void;
  readonly handleTranscriptUpdate: (transcript: readonly ConversationMessage[]) => void;
  readonly buildTranscriptSnapshot: () => readonly ConversationMessage[];
  readonly getTurnSessionEvents: () => readonly SessionEvent[];
  readonly getAllSessionEvents: () => readonly SessionEvent[];
}

/** Create one prompt-turn session projector. */
export function createPromptTurnSession(options: PromptTurnSessionOptions): PromptTurnSession {
  let latestTranscript: readonly ConversationMessage[] | undefined;
  let turnSessionEvents: SessionEvent[] = [];
  let turnSessionState: SessionState = createEmptySessionState();

  const syncTurnSessionEntries = () => {
    options.setEntries(() => [
      ...options.baseEntries,
      ...uiEntriesFromSessionState(turnSessionState)
    ]);
  };

  const latestProjectedAssistantText = () => {
    for (let index = turnSessionState.entries.length - 1; index >= 0; index -= 1) {
      const entry = turnSessionState.entries[index];
      if (entry?.kind === "assistant" && entry.content !== "") {
        return entry.content;
      }
    }
    return "";
  };

  const handleSessionEvent = (event: SessionEvent) => {
    turnSessionEvents = [...turnSessionEvents, event];
    options.setSessionEvents([...options.baseSessionEvents, ...turnSessionEvents]);
    turnSessionState = applySessionEvent(turnSessionState, event);
    syncTurnSessionEntries();

    switch (event.type) {
      case "assistant.text.delta":
        if (options.getBusyPhase() === "retrying") {
          options.setBusyPhase("thinking");
        }
        options.setProviderStatusText(undefined);
        break;
      case "tool.started":
        options.setBusyPhase("tool");
        options.setProviderStatusText(undefined);
        break;
      case "tool.completed":
      case "tool.errored": {
        const toolResult = event.toolResult;
        options.setBusyPhase("thinking");
        options.setProviderStatusText(undefined);
        options.invalidateWorkspaceFileSuggestions(options.workspaceRoot);
        options.bumpFileSuggestionVersion();
        if (!toolResult.isError && toolResult.metadata?.kind === "todo-list") {
          options.setTodos(toolResult.metadata.todos);
          if (toolResult.metadata.todos.length === 0) {
            options.closeTodoDropup();
          }
        }
        break;
      }
      case "provider.retry":
        options.setBusyPhase("retrying");
        options.setProviderStatusText(`retry ${event.status.attempt}/${event.status.maxAttempts}`);
        break;
      default:
        break;
    }
  };

  return {
    handleSessionEvent,
    handleTranscriptUpdate(transcript) {
      latestTranscript = transcript;
      options.setTranscriptMessages(transcript);
      options.setLastContextEstimate(estimateConversationContextTokens(transcript));
    },
    buildTranscriptSnapshot() {
      return buildPromptTranscriptSnapshot(latestTranscript, latestProjectedAssistantText());
    },
    getTurnSessionEvents() {
      return turnSessionEvents;
    },
    getAllSessionEvents() {
      return [...options.baseSessionEvents, ...turnSessionEvents];
    }
  };
}
