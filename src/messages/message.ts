/**
 * Conversation message model definitions.
 *
 * @author dev
 */

import type { ToolResultMetadata } from "../tools/tool.ts";

/**
 * A tool call emitted by the model.
 */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly argumentsJson: string;
}

/**
 * User message.
 */
export interface UserMessage {
  readonly role: "user";
  readonly content: string;
}

/**
 * Assistant message.
 */
export interface AssistantMessage {
  readonly role: "assistant";
  readonly content: string;
  readonly toolCalls: readonly ToolCall[];
}

/**
 * Tool result message.
 */
export interface ToolResultMessage {
  readonly role: "tool";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly content: string;
  readonly isError: boolean;
  readonly metadata?: ToolResultMetadata;
}

/**
 * Union of all internal conversation message types used by Recode.
 */
export type ConversationMessage = UserMessage | AssistantMessage | ToolResultMessage;
