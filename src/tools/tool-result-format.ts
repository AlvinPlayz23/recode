/**
 * Tool result message formatting.
 */

import type { ToolCall, ToolResultMessage } from "../transcript/message.ts";
import type { ToolResult } from "./tool.ts";

/**
 * Convert a successful tool execution result into a transcript message.
 */
export function createToolResultMessage(
  toolCall: ToolCall,
  result: ToolResult
): ToolResultMessage {
  return {
    role: "tool",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    isError: result.isError,
    ...(result.metadata === undefined ? {} : { metadata: result.metadata })
  };
}

/**
 * Convert a tool execution failure into a transcript message.
 */
export function createToolErrorMessage(toolCall: ToolCall, message: string): ToolResultMessage {
  return {
    role: "tool",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: `Tool execution failed: ${message}`,
    isError: true
  };
}

/**
 * Normalize an unknown thrown value into user-facing text.
 */
export function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
