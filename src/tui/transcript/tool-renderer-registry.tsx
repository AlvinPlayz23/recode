/**
 * Tool-specific preview renderers for transcript rows.
 */

import { TextAttributes } from "@opentui/core";
import { For, Show, createMemo, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import type {
  BashToolResultMetadata,
  EditToolResultMetadata,
  TaskToolResultMetadata,
  TodoItem,
  ToolResultMetadata
} from "../../tools/tool.ts";
import { toDisplayLines } from "../message-format.ts";
import { getTheme } from "../appearance/theme.ts";
import type { UiEntry } from "./transcript-entry-state.ts";

/** Props passed to one tool preview renderer. */
export interface ToolPreviewRendererProps {
  readonly entry: UiEntry;
  readonly metadata: ToolResultMetadata;
  readonly theme: () => ReturnType<typeof getTheme>;
}

type ToolPreviewRenderer = (props: ToolPreviewRendererProps) => JSX.Element | undefined;

type EditPreviewLineKind = "added" | "removed" | "omitted";

interface EditPreviewLine {
  readonly kind: EditPreviewLineKind;
  readonly text: string;
}

const EDIT_PREVIEW_MAX_LINES = 24;

const TOOL_PREVIEW_RENDERERS: Readonly<Partial<Record<ToolResultMetadata["kind"], ToolPreviewRenderer>>> = {
  "bash-output": BashToolBlock,
  "edit-preview": EditPreviewToolBlock,
  "task-result": TaskPreviewBlock,
  "todo-list": TodoPreviewBlock
};

/** Render a tool preview from its metadata kind. */
export function renderToolPreviewContent(props: ToolPreviewRendererProps): JSX.Element | undefined {
  return TOOL_PREVIEW_RENDERERS[props.metadata.kind]?.(props);
}

/**
 * Compute simple added/removed line counts between two text bodies.
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

function EditPreviewToolBlock(props: ToolPreviewRendererProps): JSX.Element | undefined {
  if (props.metadata.kind !== "edit-preview") {
    return undefined;
  }

  const metadata = props.metadata;
  const counts = countDiffLines(metadata.oldText, metadata.newText);
  const title = metadata.replacementCount === undefined || metadata.replacementCount === 1
    ? "Edit preview"
    : `Edit preview (${metadata.replacementCount} replacements)`;
  const previewLines = createMemo(() => buildEditPreviewLines(metadata));

  return (
    <box
      flexDirection="column"
      marginTop={1}
      marginLeft={2}
      marginRight={2}
      paddingLeft={1}
      paddingRight={1}
      border
      borderStyle="single"
      borderColor={props.theme().divider}
      backgroundColor={props.theme().bashMessageBackgroundColor}
      title={title}
      titleAlignment="left"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
    >
      <box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0}>
        <box flexGrow={1} flexShrink={1} minWidth={0}>
          <text fg={props.theme().tool} attributes={TextAttributes.BOLD}>{metadata.path}</text>
        </box>
        <box flexShrink={0} paddingLeft={2}>
          <text fg={props.theme().success} attributes={TextAttributes.BOLD}>{`+${counts.added}`}</text>
          <text fg={props.theme().hintText} attributes={TextAttributes.DIM}> </text>
          <text fg={props.theme().error} attributes={TextAttributes.BOLD}>{`-${counts.removed}`}</text>
        </box>
      </box>
      <box flexDirection="column" marginTop={1} flexGrow={1} flexShrink={1} minWidth={0}>
        <For each={previewLines()}>
          {(line) => <EditPreviewLineRow line={line} theme={props.theme} />}
        </For>
      </box>
    </box>
  );
}

function EditPreviewLineRow(props: {
  readonly line: EditPreviewLine;
  readonly theme: () => ReturnType<typeof getTheme>;
}): JSX.Element {
  const isAdded = () => props.line.kind === "added";
  const isRemoved = () => props.line.kind === "removed";
  const marker = () => isAdded() ? "+" : isRemoved() ? "-" : " ";
  const foreground = () => {
    if (isAdded()) {
      return props.theme().success;
    }
    if (isRemoved()) {
      return props.theme().error;
    }
    return props.theme().hintText;
  };
  const background = () => {
    if (isAdded()) {
      return props.theme().diffAdded;
    }
    if (isRemoved()) {
      return props.theme().diffRemoved;
    }
    return "transparent";
  };

  return (
    <box flexDirection="row" backgroundColor={background()} flexGrow={1} flexShrink={1} minWidth={0}>
      <box width={3} flexShrink={0}>
        <text fg={foreground()} attributes={TextAttributes.BOLD}>{marker()}</text>
      </box>
      <box flexGrow={1} flexShrink={1} minWidth={0}>
        <text fg={props.line.kind === "omitted" ? props.theme().hintText : props.theme().assistantBody}>
          {props.line.text === "" ? " " : props.line.text}
        </text>
      </box>
    </box>
  );
}

function buildEditPreviewLines(metadata: EditToolResultMetadata): readonly EditPreviewLine[] {
  const removedLines = splitDiffLines(metadata.oldText).map((line): EditPreviewLine => ({
    kind: "removed",
    text: line
  }));
  const addedLines = splitDiffLines(metadata.newText).map((line): EditPreviewLine => ({
    kind: "added",
    text: line
  }));
  const lines = [...removedLines, ...addedLines];

  if (lines.length <= EDIT_PREVIEW_MAX_LINES) {
    return lines;
  }

  const omittedCount = lines.length - EDIT_PREVIEW_MAX_LINES;
  return [
    ...lines.slice(0, EDIT_PREVIEW_MAX_LINES),
    {
      kind: "omitted",
      text: `... ${omittedCount} more changed line${omittedCount === 1 ? "" : "s"}`
    }
  ];
}

function splitDiffLines(value: string): readonly string[] {
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (lines.length > 1 && lines.at(-1) === "") {
    return lines.slice(0, -1);
  }

  return lines;
}

function BashToolBlock(props: ToolPreviewRendererProps): JSX.Element | undefined {
  if (props.metadata.kind !== "bash-output") {
    return undefined;
  }

  return (
    <ExpandableBashToolBlock
      metadata={props.metadata}
      error={props.entry.toolStatus === "error"}
      theme={props.theme}
    />
  );
}

function ExpandableBashToolBlock(props: {
  readonly metadata: BashToolResultMetadata;
  readonly error: boolean;
  readonly theme: () => ReturnType<typeof getTheme>;
}): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const lines = createMemo(() => toDisplayLines(props.metadata.output.trimEnd()));
  const overflowCount = createMemo(() => Math.max(0, lines().length - 10));
  const visibleLines = createMemo(() => expanded() ? lines() : lines().slice(0, 10));
  const canToggle = createMemo(() => overflowCount() > 0);

  return (
    <box
      flexDirection="column"
      marginTop={1}
      marginLeft={2}
      marginRight={2}
      paddingLeft={1}
      paddingRight={1}
      border
      borderStyle="single"
      borderColor={props.error ? props.theme().error : props.theme().bashBorder}
      backgroundColor={props.theme().bashMessageBackgroundColor}
      title={props.error ? "Bash error" : "Bash output"}
      titleAlignment="left"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      onMouseUp={() => {
        if (canToggle()) {
          setExpanded((previous) => !previous);
        }
      }}
    >
      <text fg={props.error ? props.theme().error : props.theme().tool} attributes={TextAttributes.BOLD}>{`$ ${props.metadata.command}`}</text>
      <Show when={props.metadata.output.trim() !== ""}>
        <For each={visibleLines()}>
          {(line) => <text fg={props.theme().assistantBody}>{line}</text>}
        </For>
      </Show>
      <Show when={canToggle()}>
        <text fg={props.theme().hintText} attributes={TextAttributes.DIM}>
          {expanded() ? "show less" : `... ${overflowCount()} more line${overflowCount() === 1 ? "" : "s"} (click to expand)`}
        </text>
      </Show>
    </box>
  );
}

function TodoPreviewBlock(props: ToolPreviewRendererProps): JSX.Element | undefined {
  if (props.metadata.kind !== "todo-list") {
    return undefined;
  }

  return (
    <box flexDirection="column" paddingLeft={2} paddingTop={1} paddingRight={1}>
      <For each={props.metadata.todos}>
        {(todo) => <TodoLine todo={todo} t={props.theme} />}
      </For>
    </box>
  );
}

function TaskPreviewBlock(props: ToolPreviewRendererProps): JSX.Element | undefined {
  if (props.metadata.kind !== "task-result" || props.metadata.status !== "completed") {
    return undefined;
  }

  return (
    <box flexDirection="column" paddingLeft={2} paddingTop={1} paddingRight={1}>
      <Show when={props.metadata.taskId !== undefined}>
        <text fg={props.theme().hintText} attributes={TextAttributes.DIM}>{`task_id: ${(props.metadata as TaskToolResultMetadata).taskId ?? ""}`}</text>
      </Show>
      <Show when={props.metadata.summary !== ""}>
        <text fg={props.theme().assistantBody}>{props.metadata.summary}</text>
      </Show>
    </box>
  );
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
