/**
 * Transcript entry renderer for the TUI.
 *
 * Tool rows render as compact status pills (status dot · bold name · detail).
 * Edit previews show a header line with `+N −M` line counts above the diff.
 */

import {
  TextAttributes,
  type SyntaxStyle
} from "@opentui/core";
import { For, Show } from "solid-js";
import type { BashToolResultMetadata, EditToolResultMetadata, TaskToolResultMetadata, TodoItem } from "../tools/tool.ts";
import { toDisplayLines } from "./message-format.ts";
import {
  getTheme,
  type LayoutMode
} from "./theme.ts";
import type { UiEntry } from "./transcript-entry-state.ts";

/**
 * Split a tool entry body string into a badge verb and optional detail.
 * Bodies are formatted as "Verb · detail" by formatToolCallEntry.
 */
function parseToolBadge(body: string): { badge: string; detail: string | undefined } {
  const sep = " · ";
  const idx = body.indexOf(sep);
  if (idx === -1) {
    return { badge: body, detail: undefined };
  }
  return { badge: body.slice(0, idx), detail: body.slice(idx + sep.length) };
}

function getToolStatusMarker(entry: UiEntry): string {
  switch (entry.toolStatus) {
    case "completed":
      return "● ";
    case "error":
      return "✗ ";
    case "running":
    case undefined:
      return "◇ ";
  }
  return "◇ ";
}

function getToolStatusColor(entry: UiEntry, t: () => ReturnType<typeof getTheme>): string {
  switch (entry.toolStatus) {
    case "completed":
      return t().success;
    case "error":
      return t().error;
    case "running":
    case undefined:
      return t().brandShimmer;
  }
  return t().brandShimmer;
}

/**
 * Compute simple added/removed line counts between two text bodies.
 *
 * Uses a multiset diff: lines present more times in `newText` count as added,
 * lines present more times in `oldText` count as removed. Cheap and good
 * enough for a header summary above the actual rendered diff.
 */
export function countDiffLines(oldText: string, newText: string): { added: number; removed: number } {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const oldCounts = new Map<string, number>();
  for (const line of oldLines) {
    oldCounts.set(line, (oldCounts.get(line) ?? 0) + 1);
  }
  const newCounts = new Map<string, number>();
  for (const line of newLines) {
    newCounts.set(line, (newCounts.get(line) ?? 0) + 1);
  }

  let added = 0;
  let removed = 0;
  const seen = new Set<string>();
  for (const line of [...oldCounts.keys(), ...newCounts.keys()]) {
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    const oldCount = oldCounts.get(line) ?? 0;
    const newCount = newCounts.get(line) ?? 0;
    if (newCount > oldCount) {
      added += newCount - oldCount;
    } else if (oldCount > newCount) {
      removed += oldCount - newCount;
    }
  }
  return { added, removed };
}

/**
 * Render one transcript entry.
 */
export function renderEntry(
  entry: UiEntry,
  t: () => ReturnType<typeof getTheme>,
  mdStyle: () => SyntaxStyle,
  currentStreamingId: () => string | undefined,
  currentStreamingBody: () => string,
  layout: () => LayoutMode,
  toolMarker: () => string
) {
  const compact = () => layout() === "compact";
  const userMarginY = () => compact() ? 0 : 1;

  switch (entry.kind) {
    case "user":
      return (
        <box
          flexDirection="column"
          marginTop={userMarginY()}
          marginBottom={userMarginY()}
          marginLeft={2}
          marginRight={2}
          border
          borderColor={t().userMessageBackground}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={compact() ? 0 : 0}
          paddingBottom={compact() ? 0 : 0}
        >
          <box flexDirection="row">
            <text fg={t().user}>◈ </text>
            <box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              <For each={toDisplayLines(entry.body)}>
                {(line) => <text fg={t().user}>{line}</text>}
              </For>
            </box>
          </box>
        </box>
      );

    case "assistant":
      return (
        <Show when={entry.id === currentStreamingId() ? currentStreamingBody() !== "" : entry.body !== ""}>
          <box width="100%" flexDirection="row" marginTop={compact() ? 0 : 1} marginBottom={0} paddingLeft={2}>
            <box width={2} flexShrink={0}>
              <text fg={t().assistantLabel}>❀ </text>
            </box>
            <box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} paddingRight={1}>
              <markdown
                content={entry.id === currentStreamingId() ? currentStreamingBody() : entry.body}
                syntaxStyle={mdStyle()}
                fg={t().assistantBody}
                conceal={entry.id !== currentStreamingId()}
                streaming={entry.id === currentStreamingId()}
                width="100%"
                flexShrink={1}
                tableOptions={{
                  widthMode: "content",
                  columnFitter: "balanced",
                  wrapMode: "word",
                  cellPadding: 1,
                  borders: true,
                  outerBorder: true,
                  borderStyle: "single",
                  borderColor: t().divider,
                  selectable: true
                }}
              />
            </box>
          </box>
        </Show>
      );

    case "tool": {
      const { badge, detail } = parseToolBadge(entry.body);
      return (
        <box flexDirection="row" paddingLeft={4} marginTop={0} marginBottom={0} alignItems="center">
          <text fg={getToolStatusColor(entry, t)}>{getToolStatusMarker(entry)}</text>
          <box width={Math.max(6, badge.length + 2)} flexShrink={0}>
            <text fg={t().tool} attributes={TextAttributes.BOLD}>{badge}</text>
          </box>
          <Show when={detail !== undefined}>
            <box flexGrow={1} flexShrink={1} minWidth={0}>
              <text fg={t().hintText} attributes={TextAttributes.DIM}>{detail}</text>
            </box>
          </Show>
        </box>
      );
    }

    case "tool-preview": {
      const metadata = entry.metadata;
      const { badge: previewBadge, detail: previewDetail } = parseToolBadge(entry.body);
      const editMetadata = metadata?.kind === "edit-preview"
        ? (metadata as EditToolResultMetadata)
        : undefined;
      const taskMetadata = metadata?.kind === "task-result"
        ? (metadata as TaskToolResultMetadata)
        : undefined;
      const bashMetadata = metadata?.kind === "bash-output"
        ? (metadata as BashToolResultMetadata)
        : undefined;
      const counts = editMetadata !== undefined
        ? countDiffLines(editMetadata.oldText ?? "", editMetadata.newText ?? "")
        : undefined;
      const summary = counts !== undefined
        ? `+${counts.added} −${counts.removed}`
        : undefined;

      return (
        <box flexDirection="column" paddingLeft={4} marginTop={compact() ? 0 : 1} marginBottom={0}>
          <box flexDirection="row" alignItems="center">
            <text fg={getToolStatusColor(entry, t)}>{getToolStatusMarker(entry)}</text>
            <box width={Math.max(6, previewBadge.length + 2)} flexShrink={0}>
              <text fg={t().tool} attributes={TextAttributes.BOLD}>{previewBadge}</text>
            </box>
            <Show when={previewDetail !== undefined}>
              <box flexGrow={1} flexShrink={1} minWidth={0}>
                <text fg={t().hintText} attributes={TextAttributes.DIM}>{previewDetail}</text>
              </box>
            </Show>
            <Show when={summary !== undefined}>
              <box flexShrink={0} paddingLeft={2}>
                <text fg={t().diffAdded} attributes={TextAttributes.BOLD}>{`+${counts?.added ?? 0}`}</text>
                <text fg={t().hintText} attributes={TextAttributes.DIM}> </text>
                <text fg={t().diffRemoved} attributes={TextAttributes.BOLD}>{`−${counts?.removed ?? 0}`}</text>
              </box>
            </Show>
          </box>
          <Show when={editMetadata !== undefined}>
            <box paddingLeft={2} paddingTop={1} paddingRight={1}>
              <diff
                oldCode={editMetadata?.oldText ?? ""}
                newCode={editMetadata?.newText ?? ""}
                language={resolveDiffLanguage(editMetadata?.path ?? "")}
                mode="unified"
                showLineNumbers={true}
                context={2}
                addedLineColor={t().diffAdded}
                removedLineColor={t().diffRemoved}
                unchangedLineColor="transparent"
                width="100%"
              />
            </box>
          </Show>
          <Show when={bashMetadata !== undefined}>
            <box
              flexDirection="column"
              marginTop={1}
              marginLeft={2}
              marginRight={2}
              paddingLeft={1}
              paddingRight={1}
              border
              borderStyle="single"
              borderColor={t().bashBorder}
              backgroundColor={t().bashMessageBackgroundColor}
              title="Bash output"
              titleAlignment="left"
              flexGrow={1}
              flexShrink={1}
              minWidth={0}
            >
              <text fg={t().tool} attributes={TextAttributes.BOLD}>{`$ ${bashMetadata?.command ?? ""}`}</text>
              <Show when={(bashMetadata?.output ?? "").trim() !== ""}>
                <For each={limitOutputLines(bashMetadata?.output ?? "", 10)}>
                  {(line) => <text fg={t().assistantBody}>{line}</text>}
                </For>
              </Show>
            </box>
          </Show>
          <Show when={metadata?.kind === "todo-list"}>
            <box flexDirection="column" paddingLeft={2} paddingTop={1} paddingRight={1}>
              <For each={metadata?.kind === "todo-list" ? metadata.todos : []}>
                {(todo) => <TodoLine todo={todo} t={t} />}
              </For>
            </box>
          </Show>
          <Show when={taskMetadata !== undefined && taskMetadata?.status === "completed"}>
            <box flexDirection="column" paddingLeft={2} paddingTop={1} paddingRight={1}>
              <Show when={taskMetadata?.taskId !== undefined}>
                <text fg={t().hintText} attributes={TextAttributes.DIM}>{`task_id: ${taskMetadata?.taskId ?? ""}`}</text>
              </Show>
              <Show when={(taskMetadata?.summary ?? "") !== ""}>
                <text fg={t().assistantBody}>{taskMetadata?.summary ?? ""}</text>
              </Show>
            </box>
          </Show>
        </box>
      );
    }

    case "tool-group":
      return (
        <box flexDirection="row" paddingLeft={4} marginTop={0} marginBottom={0} alignItems="center">
          <text fg={t().tool} attributes={TextAttributes.DIM}>● </text>
          <text fg={t().tool} attributes={TextAttributes.DIM}>{entry.body}</text>
        </box>
      );

    case "error":
      return (
        <box flexDirection="row" marginTop={compact() ? 0 : 1} paddingLeft={3} alignItems="center">
          <text fg={t().error} attributes={TextAttributes.BOLD}>✗ </text>
          <box flexGrow={1} flexShrink={1} minWidth={0}>
            <text fg={t().error}>{entry.body}</text>
          </box>
        </box>
      );

    case "status":
      return (
        <box flexDirection="row" marginTop={0} marginBottom={0} paddingLeft={3}>
          <text fg={t().statusText} attributes={TextAttributes.DIM}>◌ {entry.body}</text>
        </box>
      );
  }
}

function TodoLine(props: { todo: TodoItem; t: () => ReturnType<typeof getTheme> }) {
  const marker = () => {
    switch (props.todo.status) {
      case "completed":
        return "x";
      case "in_progress":
        return ">";
      case "cancelled":
        return "-";
      case "pending":
        return " ";
    }
  };
  const color = () => props.todo.status === "completed"
    ? props.t().success
    : props.todo.status === "cancelled"
      ? props.t().hintText
      : props.todo.priority === "high"
        ? props.t().warning
        : props.t().assistantBody;

  return (
    <box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0}>
      <box width={4} flexShrink={0}>
        <text fg={color()}>{`[${marker()}] `}</text>
      </box>
      <box width={8} flexShrink={0}>
        <text fg={props.t().hintText} attributes={TextAttributes.DIM}>{props.todo.priority}</text>
      </box>
      <box flexGrow={1} flexShrink={1} minWidth={0}>
        <text fg={color()}>{props.todo.content}</text>
      </box>
    </box>
  );
}

function limitOutputLines(value: string, maxLines: number): readonly string[] {
  const lines = toDisplayLines(value.trimEnd());
  if (lines.length <= maxLines) {
    return lines;
  }

  return [...lines.slice(0, maxLines), "..."];
}

function resolveDiffLanguage(path: string): string {
  const normalized = path.trim().toLowerCase();

  if (normalized.endsWith(".tsx") || normalized.endsWith(".ts") || normalized.endsWith(".jsx") || normalized.endsWith(".js")) {
    return "typescript";
  }

  if (normalized.endsWith(".json")) {
    return "json";
  }

  if (normalized.endsWith(".md")) {
    return "markdown";
  }

  if (normalized.endsWith(".css")) {
    return "css";
  }

  if (normalized.endsWith(".html")) {
    return "html";
  }

  if (normalized.endsWith(".sh")) {
    return "bash";
  }

  return "text";
}
