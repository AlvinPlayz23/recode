/**
 * Prompt submission helpers for the TUI.
 */

import type { AgentRunResult, TextDeltaObserver } from "../agent/run-agent-loop.ts";
import { runAgentLoop } from "../agent/run-agent-loop.ts";
import type { AiModel } from "../ai/types.ts";
import type { ConversationMessage, ToolCall } from "../messages/message.ts";
import type { ToolExecutionContext } from "../tools/tool.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";

/**
 * A compact placeholder for pasted multi-line text in the prompt composer.
 */
export interface PendingPaste {
  readonly token: string;
  readonly text: string;
}

/**
 * Options for one agent turn from the TUI.
 */
export interface SingleTurnOptions {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly previousMessages: readonly ConversationMessage[];
  readonly languageModel: AiModel;
  readonly toolRegistry: ToolRegistry;
  readonly toolContext: ToolExecutionContext;
  readonly abortSignal?: AbortSignal;
  readonly onToolCall: (toolCall: ToolCall) => void;
  readonly onTextDelta: TextDeltaObserver;
  readonly onToolResult?: (toolResult: Extract<ConversationMessage, { role: "tool" }>) => void;
}

/**
 * Run a single user prompt through the iterative agent loop.
 */
export async function runSingleTurn(options: SingleTurnOptions): Promise<AgentRunResult> {
  return await runAgentLoop({
    systemPrompt: options.systemPrompt,
    initialUserPrompt: options.prompt,
    previousMessages: options.previousMessages,
    languageModel: options.languageModel,
    toolRegistry: options.toolRegistry,
    toolContext: options.toolContext,
    ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
    onToolCall(toolCall) {
      options.onToolCall(toolCall);
    },
    onTextDelta(delta) {
      options.onTextDelta(delta);
    },
    onToolResult(toolResult) {
      options.onToolResult?.(toolResult);
    }
  });
}

/**
 * Replace compact paste placeholders with their full pasted text.
 */
export function expandDraftPastes(value: string, pastes: readonly PendingPaste[]): string {
  let expanded = value;

  for (const paste of pastes) {
    expanded = expanded.replaceAll(paste.token, paste.text);
  }

  return expanded;
}
