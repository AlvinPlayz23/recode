/**
 * Transcript entry state and formatting helpers for the TUI.
 */

import type { TodoItem, ToolResultMetadata } from "../tools/tool.ts";
import { parseTodoWriteInput } from "../tools/todo-write-tool.ts";
import {
  formatContinuationSummaryForDisplay,
  type ConversationMessage,
  type ToolCall
} from "../transcript/message.ts";

/**
 * One rendered transcript row in the TUI.
 */
export interface UiEntry {
  readonly id: string;
  readonly kind: "user" | "assistant" | "tool" | "tool-preview" | "tool-group" | "error" | "status";
  readonly title: string;
  readonly body: string;
  readonly metadata?: ToolResultMetadata;
}

/**
 * Solid-style entry setter accepted by transcript mutation helpers.
 */
export interface SetUiEntries {
  (setter: (previous: readonly UiEntry[]) => readonly UiEntry[]): void;
}

/**
 * Create a UI entry with a unique local ID.
 */
export function createEntry(kind: UiEntry["kind"], title: string, body: string): UiEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    body
  };
}

/**
 * Append one UI entry to the transcript list.
 */
export function appendEntry(setEntries: SetUiEntries, entry: UiEntry): void {
  setEntries((previous) => [...previous, entry]);
}

/**
 * Update one entry body by ID.
 */
export function updateEntryBody(
  setEntries: SetUiEntries,
  entryId: string,
  updateBody: (body: string) => string
): void {
  setEntries((previous) => previous.map((entry) =>
    entry.id === entryId
      ? { ...entry, body: updateBody(entry.body) }
      : entry
  ));
}

/**
 * Convert one tool call into a compact transcript preview line.
 */
export function formatToolCallEntry(toolCall: ToolCall): string {
  const displayName = toToolDisplayName(toolCall.name);
  const summary = summarizeToolArguments(toolCall.name, toolCall.argumentsJson);

  if (summary === "") {
    return displayName;
  }

  return `${displayName} · ${summary}`;
}

/**
 * Summarize tool arguments for transcript display.
 */
export function summarizeToolArguments(toolName: string, argumentsJson: string): string {
  const args = parseToolArguments(argumentsJson);

  switch (toolName) {
    case "Bash":
      return readTrimmedString(args, "command", 72);
    case "AskUserQuestion": {
      const questions = args?.["questions"];
      return Array.isArray(questions)
        ? `${questions.length} question${questions.length === 1 ? "" : "s"}`
        : "";
    }
    case "TodoWrite": {
      const todos = args?.["todos"];
      return Array.isArray(todos)
        ? `${todos.length} todo${todos.length === 1 ? "" : "s"}`
        : "";
    }
    case "Read":
    case "Write":
    case "Edit":
      return readTrimmedString(args, "path", 72);
    case "Glob":
      return readTrimmedString(args, "pattern", 72);
    case "Grep": {
      const pattern = readTrimmedString(args, "pattern", 44);
      const include = readTrimmedString(args, "include", 24);
      if (pattern !== "" && include !== "") {
        return `${pattern} in ${include}`;
      }
      return pattern || include;
    }
    case "WebFetch":
      return readTrimmedString(args, "url", 72);
    case "WebSearch":
      return readTrimmedString(args, "query", 72);
    default:
      return "";
  }
}

/**
 * Convert saved transcript messages into visible UI entries.
 */
export function rehydrateEntriesFromTranscript(transcript: readonly ConversationMessage[]): readonly UiEntry[] {
  const entries: UiEntry[] = [];

  for (const message of transcript) {
    switch (message.role) {
      case "user":
        entries.push(createEntry("user", "You", message.content));
        break;
      case "assistant":
        if (message.content.trim() !== "") {
          entries.push(createEntry("assistant", "Recode", message.content));
        }
        for (const toolCall of message.toolCalls) {
          const toolCallEntry = createToolCallUiEntry(toolCall);
          if (toolCallEntry !== undefined) {
            entries.push(toolCallEntry);
          }
        }
        break;
      case "summary":
        entries.push(createEntry("status", "status", "Earlier conversation history was compacted into a continuation summary."));
        entries.push(createEntry("assistant", "Recode", formatContinuationSummaryForDisplay(message.content)));
        break;
      case "tool":
        {
          const toolResultEntry = createToolResultUiEntry(
            message.toolName,
            message.content,
            message.isError,
            message.metadata
          );
          if (toolResultEntry !== undefined) {
            entries.push(toolResultEntry);
          }
        }
        break;
    }
  }

  return entries;
}

/**
 * Create the visible UI entry for a tool call.
 */
export function createToolCallUiEntry(toolCall: ToolCall): UiEntry | undefined {
  if (toolCall.name === "TodoWrite") {
    const metadata = readTodoToolCallMetadata(toolCall.argumentsJson);
    if (metadata !== undefined) {
      return createTodoPreviewEntry(toolCall.name, metadata);
    }
  }

  return createEntry("tool", "tool", formatToolCallEntry(toolCall));
}

/**
 * Return the latest todo list state recorded in a transcript.
 */
export function extractLatestTodosFromTranscript(
  transcript: readonly ConversationMessage[]
): readonly TodoItem[] {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const message = transcript[index];
    if (message?.role === "tool" && message.metadata?.kind === "todo-list") {
      return message.metadata.todos;
    }
  }

  return [];
}

/**
 * Create a visible tool-result entry when the tool result has renderable metadata.
 */
export function createToolResultEntry(
  toolName: string,
  _content: string,
  metadata: ToolResultMetadata | undefined
): UiEntry | undefined {
  if (metadata?.kind === "edit-preview") {
    const detail = metadata.replacementCount === undefined || metadata.replacementCount === 1
      ? metadata.path
      : `${metadata.path} (${metadata.replacementCount} replacements)`;
    return {
      ...createEntry("tool-preview", "tool", `${toToolDisplayName(toolName)} · ${detail}`),
      metadata
    };
  }

  if (metadata?.kind === "todo-list") {
    return undefined;
  }

  return undefined;
}

function createTodoPreviewEntry(
  toolName: string,
  metadata: ToolResultMetadata & { readonly kind: "todo-list" }
): UiEntry | undefined {
  const remaining = metadata.todos.filter((todo) => todo.status !== "completed" && todo.status !== "cancelled").length;
  if (remaining === 0) {
    return undefined;
  }

  const completed = metadata.todos.filter((todo) => todo.status === "completed").length;
  return {
    ...createEntry("tool-preview", "tool", `${toToolDisplayName(toolName)} · ${remaining} active, ${completed} completed`),
    metadata
  };
}

function readTodoToolCallMetadata(argumentsJson: string): (ToolResultMetadata & { readonly kind: "todo-list" }) | undefined {
  const args = parseToolArguments(argumentsJson);
  if (args === undefined) {
    return undefined;
  }

  try {
    return {
      kind: "todo-list",
      todos: parseTodoWriteInput(args).todos
    };
  } catch {
    return undefined;
  }
}

/**
 * Create the visible UI entry for a tool result when one should be shown.
 */
export function createToolResultUiEntry(
  toolName: string,
  content: string,
  isError: boolean,
  metadata: ToolResultMetadata | undefined
): UiEntry | undefined {
  if (isError) {
    return createEntry("error", "error", `${toolName} failed: ${content}`);
  }

  return createToolResultEntry(toolName, content, metadata);
}

/**
 * Collapse consecutive tool entries into summary rows when requested.
 */
export function renderVisibleEntries(
  entries: readonly UiEntry[],
  collapsed: boolean
): readonly UiEntry[] {
  if (!collapsed) {
    return entries;
  }

  const result: UiEntry[] = [];
  let toolRunCount = 0;
  let toolRunStartIndex = -1;

  for (let i = 0; i <= entries.length; i++) {
    const entry = entries[i];
    const isTool = entry !== undefined && entry.kind === "tool";

    if (isTool) {
      if (toolRunCount === 0) {
        toolRunStartIndex = i;
      }
      toolRunCount += 1;
      continue;
    }

    if (toolRunCount > 0) {
      if (toolRunCount === 1) {
        result.push(entries[toolRunStartIndex]!);
      } else {
        result.push(createEntry(
          "tool-group",
          "tool",
          `${toolRunCount} tool calls (collapsed)`
        ));
      }
      toolRunCount = 0;
      toolRunStartIndex = -1;
    }

    if (entry !== undefined) {
      result.push(entry);
    }
  }

  return result;
}

function toToolDisplayName(toolName: string): string {
  switch (toolName) {
    case "Bash":
      return "Bash";
    case "AskUserQuestion":
      return "Ask";
    case "TodoWrite":
      return "Todo";
    case "Read":
      return "Read";
    case "Write":
      return "Write";
    case "Edit":
      return "Edit";
    case "Glob":
      return "Glob";
    case "Grep":
      return "Grep";
    case "WebFetch":
      return "WebFetch";
    case "WebSearch":
      return "WebSearch";
    default:
      return toTitleCase(toolName.replaceAll("_", " "));
  }
}

function parseToolArguments(argumentsJson: string): Record<string, unknown> | undefined {
  try {
    const parsedValue: unknown = JSON.parse(argumentsJson);

    if (parsedValue !== null && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
      return parsedValue as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function readTrimmedString(
  record: Record<string, unknown> | undefined,
  key: string,
  maxLength: number
): string {
  const value = record?.[key];

  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter((part) => part !== "")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
