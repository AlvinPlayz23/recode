/**
 * JSON parsing and shaping helpers for Recode history.
 */

import type { StepStats, StepTokenUsage } from "../agent/step-stats.ts";
import { isRecord } from "../shared/is-record.ts";
import type {
  AssistantMessage,
  ContinuationSummaryMessage,
  ConversationMessage,
  ToolCall,
  ToolResultMessage,
  UserMessage
} from "../transcript/message.ts";
import type { EditToolResultMetadata, ToolResultMetadata } from "../tools/tool.ts";
import type {
  RecodeHistoryIndex,
  SavedConversationMeta,
  SavedConversationRecord
} from "./recode-history-types.ts";

export const HISTORY_VERSION = 1;

/**
 * Return an empty history index.
 */
export function createEmptyHistoryIndex(): RecodeHistoryIndex {
  return {
    version: HISTORY_VERSION,
    conversations: []
  };
}

/**
 * Convert a full conversation record into index metadata.
 */
export function conversationToMeta(conversation: SavedConversationRecord): SavedConversationMeta {
  return {
    id: conversation.id,
    title: conversation.title,
    preview: conversation.preview,
    workspaceRoot: conversation.workspaceRoot,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    providerId: conversation.providerId,
    providerName: conversation.providerName,
    model: conversation.model,
    mode: conversation.mode,
    messageCount: conversation.messageCount
  };
}

/**
 * Parse persisted history index JSON.
 */
export function parseHistoryIndex(value: unknown): RecodeHistoryIndex {
  if (!isRecord(value)) {
    return createEmptyHistoryIndex();
  }

  const conversationsValue = value["conversations"];
  const conversations = Array.isArray(conversationsValue)
    ? conversationsValue.map(parseConversationMeta).filter((item) => item !== undefined)
    : [];
  const lastConversationId = readOptionalString(value, "lastConversationId");

  return {
    version: HISTORY_VERSION,
    conversations,
    ...(lastConversationId === undefined ? {} : { lastConversationId })
  };
}

/**
 * Parse one persisted conversation record.
 */
export function parseConversationRecord(value: unknown): SavedConversationRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const meta = parseConversationMeta(value);
  if (meta === undefined) {
    return undefined;
  }

  const transcriptValue = value["transcript"];
  const transcript = Array.isArray(transcriptValue)
    ? transcriptValue.map(parseConversationMessage).filter((item) => item !== undefined)
    : [];

  return {
    ...meta,
    transcript
  };
}

function parseConversationMeta(value: unknown): SavedConversationMeta | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readOptionalString(value, "id");
  const title = readOptionalString(value, "title");
  const preview = readOptionalString(value, "preview");
  const workspaceRoot = readOptionalString(value, "workspaceRoot") ?? "";
  const createdAt = readOptionalString(value, "createdAt");
  const updatedAt = readOptionalString(value, "updatedAt");
  const providerId = readOptionalString(value, "providerId");
  const providerName = readOptionalString(value, "providerName");
  const model = readOptionalString(value, "model");
  const mode = value["mode"] === "plan" ? "plan" : "build";
  const messageCount = typeof value["messageCount"] === "number" && Number.isFinite(value["messageCount"])
    ? Math.max(0, Math.trunc(value["messageCount"]))
    : undefined;

  if (
    id === undefined
    || title === undefined
    || preview === undefined
    || createdAt === undefined
    || updatedAt === undefined
    || providerId === undefined
    || providerName === undefined
    || model === undefined
    || messageCount === undefined
  ) {
    return undefined;
  }

  return {
    id,
    title,
    preview,
    workspaceRoot,
    createdAt,
    updatedAt,
    providerId,
    providerName,
    model,
    mode,
    messageCount
  };
}

function parseConversationMessage(value: unknown): ConversationMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  switch (value["role"]) {
    case "user":
      return parseUserMessage(value);
    case "assistant":
      return parseAssistantMessage(value);
    case "tool":
      return parseToolResultMessage(value);
    case "summary":
      return parseContinuationSummaryMessage(value);
    default:
      return undefined;
  }
}

function parseUserMessage(value: Record<string, unknown>): UserMessage | undefined {
  const content = readOptionalString(value, "content");
  if (content === undefined) {
    return undefined;
  }

  return {
    role: "user",
    content
  };
}

function parseAssistantMessage(value: Record<string, unknown>): AssistantMessage | undefined {
  const content = readOptionalString(value, "content");
  const toolCallsValue = value["toolCalls"];
  const toolCalls = Array.isArray(toolCallsValue)
    ? toolCallsValue.map(parseToolCall).filter((item) => item !== undefined)
    : [];
  const stepStats = parseStepStats(value["stepStats"]);

  if (content === undefined) {
    return undefined;
  }

  return {
    role: "assistant",
    content,
    toolCalls,
    ...(stepStats === undefined ? {} : { stepStats })
  };
}

function parseToolResultMessage(value: Record<string, unknown>): ToolResultMessage | undefined {
  const toolCallId = readOptionalString(value, "toolCallId");
  const toolName = readOptionalString(value, "toolName");
  const content = readOptionalString(value, "content");
  const metadata = parseToolResultMetadata(value["metadata"]);

  if (
    toolCallId === undefined
    || toolName === undefined
    || content === undefined
    || typeof value["isError"] !== "boolean"
  ) {
    return undefined;
  }

  return {
    role: "tool",
    toolCallId,
    toolName,
    content,
    isError: value["isError"],
    ...(metadata === undefined ? {} : { metadata })
  };
}

function parseContinuationSummaryMessage(value: Record<string, unknown>): ContinuationSummaryMessage | undefined {
  const content = readOptionalString(value, "content");
  const kind = readOptionalString(value, "kind");

  if (content === undefined || kind !== "continuation") {
    return undefined;
  }

  return {
    role: "summary",
    kind: "continuation",
    content
  };
}

function parseToolCall(value: unknown): ToolCall | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readOptionalString(value, "id");
  const name = readOptionalString(value, "name");
  const argumentsJson = readOptionalString(value, "argumentsJson");

  if (id === undefined || name === undefined || argumentsJson === undefined) {
    return undefined;
  }

  return {
    id,
    name,
    argumentsJson
  };
}

function parseToolResultMetadata(value: unknown): ToolResultMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  switch (value["kind"]) {
    case "edit-preview":
      return parseEditToolResultMetadata(value);
    default:
      return undefined;
  }
}

function parseEditToolResultMetadata(value: Record<string, unknown>): EditToolResultMetadata | undefined {
  const path = readOptionalString(value, "path");
  const oldText = typeof value["oldText"] === "string" ? value["oldText"] : undefined;
  const newText = typeof value["newText"] === "string" ? value["newText"] : undefined;

  if (path === undefined || oldText === undefined || newText === undefined) {
    return undefined;
  }

  return {
    kind: "edit-preview",
    path,
    oldText,
    newText
  };
}

function parseStepStats(value: unknown): StepStats | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const finishReason = readOptionalString(value, "finishReason");
  const durationMs = typeof value["durationMs"] === "number" && Number.isFinite(value["durationMs"])
    ? Math.max(0, Math.trunc(value["durationMs"]))
    : undefined;
  const toolCallCount = typeof value["toolCallCount"] === "number" && Number.isFinite(value["toolCallCount"])
    ? Math.max(0, Math.trunc(value["toolCallCount"]))
    : undefined;
  const costUsd = typeof value["costUsd"] === "number" && Number.isFinite(value["costUsd"])
    ? value["costUsd"]
    : undefined;
  const tokenUsage = parseStepTokenUsage(value["tokenUsage"]);

  if (finishReason === undefined || durationMs === undefined || toolCallCount === undefined) {
    return undefined;
  }

  return {
    finishReason,
    durationMs,
    toolCallCount,
    ...(costUsd === undefined ? {} : { costUsd }),
    ...(tokenUsage === undefined ? {} : { tokenUsage })
  };
}

function parseStepTokenUsage(value: unknown): StepTokenUsage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const input = readRequiredFiniteNumber(value, "input");
  const output = readRequiredFiniteNumber(value, "output");
  const reasoning = readRequiredFiniteNumber(value, "reasoning");
  const cacheRead = readRequiredFiniteNumber(value, "cacheRead");
  const cacheWrite = readRequiredFiniteNumber(value, "cacheWrite");

  if (
    input === undefined
    || output === undefined
    || reasoning === undefined
    || cacheRead === undefined
    || cacheWrite === undefined
  ) {
    return undefined;
  }

  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite
  };
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readRequiredFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
