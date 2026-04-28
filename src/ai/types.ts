/**
 * Types for Banka Code's internal AI transport layer.
 */

import type { RuntimeConfig } from "../runtime/runtime-config.ts";
import type { ConversationMessage } from "../messages/message.ts";
import type { ToolDefinition } from "../tools/tool.ts";

/**
 * Supported low-level API modes in the internal AI layer.
 */
export type AiApiKind = "openai-responses" | "openai-chat-completions" | "anthropic-messages";

/**
 * Internal model descriptor used by the AI transport layer.
 */
export interface AiModel {
  readonly provider: RuntimeConfig["provider"];
  readonly modelId: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly api: AiApiKind;
}

/**
 * Normalized stream events emitted by provider adapters.
 */
export type AiStreamPart =
  | { readonly type: "text-delta"; readonly text: string }
  | {
      readonly type: "tool-call";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly input: Record<string, unknown>;
    }
  | { readonly type: "error"; readonly error: unknown }
  | { readonly type: "abort" }
  | { readonly type: "finish-step" }
  | { readonly type: "finish" };

/**
 * Stream wrapper consumed by the agent loop.
 */
export interface AiResponseStream {
  readonly fullStream: AsyncIterable<AiStreamPart>;
}

/**
 * Parameters for one streamed assistant response.
 */
export interface StreamAssistantResponseOptions {
  readonly model: AiModel;
  readonly systemPrompt: string;
  readonly messages: readonly ConversationMessage[];
  readonly tools: readonly ToolDefinition[];
  readonly abortSignal?: AbortSignal;
}
