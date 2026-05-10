/**
 * JSON parsing and shaping helpers for Recode history.
 */

import type { StepStats, StepTokenUsage } from "../agent/step-stats.ts";
import { isSubagentType, type SubagentTaskRecord } from "../agent/subagent.ts";
import { isRecord } from "../shared/is-record.ts";
import { isJsonObject } from "../shared/json-value.ts";
import type {
  AssistantMessage,
  ContinuationSummaryMessage,
  ConversationMessage,
  ToolCall,
  ToolResultMessage,
  UserMessage
} from "../transcript/message.ts";
import type {
  BashToolResultMetadata,
  EditToolResultMetadata,
  TaskToolResultMetadata,
  TodoItem,
  TodoToolResultMetadata,
  ToolResultMetadata
} from "../tools/tool.ts";
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
  const subagentTasksValue = value["subagentTasks"];
  const subagentTasks = Array.isArray(subagentTasksValue)
    ? subagentTasksValue.map(parseSubagentTaskRecord).filter((item) => item !== undefined)
    : [];

  return {
    ...meta,
    transcript,
    ...(subagentTasks.length === 0 ? {} : { subagentTasks })
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
  const content = typeof value["content"] === "string" ? value["content"] : undefined;
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
  const extraContent = isJsonObject(value["extraContent"]) ? value["extraContent"] : undefined;

  if (id === undefined || name === undefined || argumentsJson === undefined) {
    return undefined;
  }

  return {
    id,
    name,
    argumentsJson,
    ...(extraContent === undefined ? {} : { extraContent })
  };
}

function parseToolResultMetadata(value: unknown): ToolResultMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  switch (value["kind"]) {
    case "bash-output":
      return parseBashToolResultMetadata(value);
    case "edit-preview":
      return parseEditToolResultMetadata(value);
    case "todo-list":
      return parseTodoToolResultMetadata(value);
    case "task-result":
      return parseTaskToolResultMetadata(value);
    default:
      return undefined;
  }
}

function parseBashToolResultMetadata(value: Record<string, unknown>): BashToolResultMetadata | undefined {
  const command = readOptionalString(value, "command");
  const output = typeof value["output"] === "string" ? value["output"] : undefined;
  const exitCode = typeof value["exitCode"] === "number" && Number.isFinite(value["exitCode"])
    ? Math.trunc(value["exitCode"])
    : undefined;
  const timedOut = typeof value["timedOut"] === "boolean" ? value["timedOut"] : undefined;
  const aborted = typeof value["aborted"] === "boolean" ? value["aborted"] : undefined;

  if (command === undefined || output === undefined) {
    return undefined;
  }

  return {
    kind: "bash-output",
    command,
    output,
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(timedOut === undefined ? {} : { timedOut }),
    ...(aborted === undefined ? {} : { aborted })
  };
}

function parseSubagentTaskRecord(value: unknown): SubagentTaskRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readOptionalString(value, "id");
  const subagentType = readOptionalString(value, "subagentType");
  const description = readOptionalString(value, "description");
  const prompt = readOptionalString(value, "prompt");
  const createdAt = readOptionalString(value, "createdAt");
  const updatedAt = readOptionalString(value, "updatedAt");
  const providerId = readOptionalString(value, "providerId");
  const providerName = readOptionalString(value, "providerName");
  const model = readOptionalString(value, "model");
  const transcriptValue = value["transcript"];
  const transcript = Array.isArray(transcriptValue)
    ? transcriptValue.map(parseConversationMessage).filter((item) => item !== undefined)
    : [];

  if (
    id === undefined
    || subagentType === undefined
    || !isSubagentType(subagentType)
    || description === undefined
    || prompt === undefined
    || createdAt === undefined
    || updatedAt === undefined
    || providerId === undefined
    || providerName === undefined
    || model === undefined
    || value["status"] !== "completed"
  ) {
    return undefined;
  }

  return {
    id,
    subagentType,
    description,
    prompt,
    transcript,
    createdAt,
    updatedAt,
    providerId,
    providerName,
    model,
    status: "completed"
  };
}

function parseEditToolResultMetadata(value: Record<string, unknown>): EditToolResultMetadata | undefined {
  const path = readOptionalString(value, "path");
  const oldText = typeof value["oldText"] === "string" ? value["oldText"] : undefined;
  const newText = typeof value["newText"] === "string" ? value["newText"] : undefined;
  const replacementCount = typeof value["replacementCount"] === "number" && Number.isFinite(value["replacementCount"])
    ? Math.max(0, Math.trunc(value["replacementCount"]))
    : undefined;

  if (path === undefined || oldText === undefined || newText === undefined) {
    return undefined;
  }

  return {
    kind: "edit-preview",
    path,
    oldText,
    newText,
    ...(replacementCount === undefined ? {} : { replacementCount })
  };
}

function parseTodoToolResultMetadata(value: Record<string, unknown>): TodoToolResultMetadata | undefined {
  const todosValue = value["todos"];
  if (!Array.isArray(todosValue)) {
    return undefined;
  }

  const todos = todosValue.map(parseTodoItem).filter((item) => item !== undefined);
  return {
    kind: "todo-list",
    todos
  };
}

function parseTaskToolResultMetadata(value: Record<string, unknown>): TaskToolResultMetadata | undefined {
  const subagentType = readOptionalString(value, "subagentType");
  const description = readOptionalString(value, "description");
  const summary = typeof value["summary"] === "string" ? value["summary"] : undefined;
  const status = value["status"];
  const taskId = readOptionalString(value, "taskId");

  if (
    subagentType === undefined
    || !isSubagentType(subagentType)
    || description === undefined
    || summary === undefined
    || (status !== "running" && status !== "completed")
    || typeof value["resumed"] !== "boolean"
  ) {
    return undefined;
  }

  return {
    kind: "task-result",
    subagentType,
    description,
    status,
    summary,
    resumed: value["resumed"],
    ...(taskId === undefined ? {} : { taskId })
  };
}

function parseTodoItem(value: unknown): TodoItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const content = readOptionalString(value, "content");
  const activeForm = readOptionalString(value, "activeForm");
  const status = value["status"];
  const priority = value["priority"];

  if (
    content === undefined
    || activeForm === undefined
    || (status !== "pending" && status !== "in_progress" && status !== "completed" && status !== "cancelled")
    || (priority !== "high" && priority !== "medium" && priority !== "low")
  ) {
    return undefined;
  }

  return {
    content,
    activeForm,
    status,
    priority
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
