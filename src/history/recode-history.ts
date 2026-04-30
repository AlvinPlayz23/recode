/**
 * Persistent conversation history for Recode.
 *
 * @author dev
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { StepStats, StepTokenUsage } from "../agent/step-stats.ts";
import type { RuntimeConfig } from "../runtime/runtime-config.ts";
import { isRecord } from "../shared/is-record.ts";
import type { AssistantMessage, ConversationMessage, ToolCall, ToolResultMessage, UserMessage } from "../messages/message.ts";
import type { EditToolResultMetadata, ToolResultMetadata } from "../tools/tool.ts";
import type { SessionMode } from "../tui/session-mode.ts";

const HISTORY_VERSION = 1;
const HISTORY_INDEX_FILENAME = "index.json";

/**
 * One saved conversation summary entry.
 */
export interface SavedConversationMeta {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
  readonly workspaceRoot: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly model: string;
  readonly mode: SessionMode;
  readonly messageCount: number;
}

/**
 * One saved conversation record.
 */
export interface SavedConversationRecord extends SavedConversationMeta {
  readonly transcript: readonly ConversationMessage[];
}

/**
 * Global conversation history index.
 */
export interface RecodeHistoryIndex {
  readonly version: 1;
  readonly lastConversationId?: string;
  readonly conversations: readonly SavedConversationMeta[];
}

/**
 * Resolve the history root directory from the config file path.
 */
export function resolveHistoryRoot(configPath: string): string {
  return resolve(dirname(configPath), "history");
}

/**
 * Load the persistent history index. Missing files return an empty index.
 */
export function loadHistoryIndex(historyRoot: string): RecodeHistoryIndex {
  const indexPath = join(historyRoot, HISTORY_INDEX_FILENAME);

  try {
    const rawText = readFileSync(indexPath, "utf8");
    return parseHistoryIndex(JSON.parse(rawText) as unknown);
  } catch (error) {
    if (isMissingFileError(error)) {
      return createEmptyHistoryIndex();
    }

    throw error;
  }
}

/**
 * Load a saved conversation by ID.
 */
export function loadConversation(historyRoot: string, conversationId: string): SavedConversationRecord | undefined {
  const filePath = getConversationFilePath(historyRoot, conversationId);

  try {
    const rawText = readFileSync(filePath, "utf8");
    return parseConversationRecord(JSON.parse(rawText) as unknown);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

/**
 * Create a new conversation record for the current runtime session.
 */
export function createConversationRecord(
  runtimeConfig: Pick<RuntimeConfig, "workspaceRoot" | "providerId" | "providerName" | "model">,
  transcript: readonly ConversationMessage[],
  mode: SessionMode,
  seed?: Partial<Pick<SavedConversationRecord, "id" | "createdAt">>
): SavedConversationRecord {
  const now = new Date().toISOString();
  const createdAt = seed?.createdAt ?? now;
  const id = seed?.id ?? crypto.randomUUID();

  return {
    ...buildConversationMeta(runtimeConfig, transcript, mode, createdAt, now, id),
    transcript
  };
}

/**
 * Persist a conversation and update the history index.
 */
export function saveConversation(
  historyRoot: string,
  conversation: SavedConversationRecord,
  makeCurrent: boolean
): RecodeHistoryIndex {
  mkdirSync(historyRoot, { recursive: true });

  const filePath = getConversationFilePath(historyRoot, conversation.id);
  writeFileSync(filePath, `${JSON.stringify(conversation, null, 2)}\n`, "utf8");

  const currentIndex = loadHistoryIndex(historyRoot);
  const nextMeta = conversationToMeta(conversation);
  const conversations = [
    nextMeta,
    ...currentIndex.conversations.filter((item) => item.id !== conversation.id)
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const nextIndex: RecodeHistoryIndex = {
    version: HISTORY_VERSION,
    conversations,
    ...((makeCurrent ? conversation.id : currentIndex.lastConversationId) === undefined
      ? {}
      : { lastConversationId: makeCurrent ? conversation.id : currentIndex.lastConversationId })
  };

  writeHistoryIndex(historyRoot, nextIndex);
  return nextIndex;
}

/**
 * Mark one conversation as the last active session.
 */
export function markConversationAsCurrent(historyRoot: string, conversationId: string): RecodeHistoryIndex {
  const currentIndex = loadHistoryIndex(historyRoot);
  const nextIndex: RecodeHistoryIndex = {
    version: HISTORY_VERSION,
    conversations: currentIndex.conversations,
    lastConversationId: conversationId
  };

  writeHistoryIndex(historyRoot, nextIndex);
  return nextIndex;
}

/**
 * Build a conversation preview and title from transcript content.
 */
export function buildConversationMeta(
  runtimeConfig: Pick<RuntimeConfig, "workspaceRoot" | "providerId" | "providerName" | "model">,
  transcript: readonly ConversationMessage[],
  mode: SessionMode,
  createdAt: string,
  updatedAt: string,
  conversationId: string
): SavedConversationMeta {
  const userMessages = transcript.filter((message): message is UserMessage => message.role === "user");
  const assistantMessages = transcript.filter((message): message is AssistantMessage => message.role === "assistant");
  const titleSource = userMessages[0]?.content ?? assistantMessages[0]?.content ?? "New Conversation";
  const previewSource = assistantMessages.at(-1)?.content
    ?? userMessages.at(-1)?.content
    ?? "No messages yet";

  return {
    id: conversationId,
    title: summarizeText(titleSource, 64),
    preview: summarizeText(previewSource, 120),
    workspaceRoot: runtimeConfig.workspaceRoot,
    createdAt,
    updatedAt,
    providerId: runtimeConfig.providerId,
    providerName: runtimeConfig.providerName,
    model: runtimeConfig.model,
    mode,
    messageCount: userMessages.length + assistantMessages.length
  };
}

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
 * Return only conversations that belong to the current workspace.
 */
export function listHistoryForWorkspace(
  index: RecodeHistoryIndex,
  workspaceRoot: string
): readonly SavedConversationMeta[] {
  const workspaceKey = toWorkspaceKey(workspaceRoot);
  return index.conversations.filter((conversation) => toWorkspaceKey(conversation.workspaceRoot) === workspaceKey);
}

function writeHistoryIndex(historyRoot: string, index: RecodeHistoryIndex): void {
  mkdirSync(historyRoot, { recursive: true });
  const indexPath = join(historyRoot, HISTORY_INDEX_FILENAME);
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function conversationToMeta(conversation: SavedConversationRecord): SavedConversationMeta {
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

function getConversationFilePath(historyRoot: string, conversationId: string): string {
  return join(historyRoot, `${conversationId}.json`);
}

function parseHistoryIndex(value: unknown): RecodeHistoryIndex {
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

function parseConversationRecord(value: unknown): SavedConversationRecord | undefined {
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

function summarizeText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized === "") {
    return "New Conversation";
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
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

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && error.code === "ENOENT";
}

function toWorkspaceKey(workspaceRoot: string): string {
  const normalized = workspaceRoot.trim() === ""
    ? ""
    : resolve(workspaceRoot).replace(/[\\/]+$/u, "");

  return process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}
