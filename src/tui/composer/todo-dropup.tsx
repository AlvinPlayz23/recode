/**
 * Composer todo dropup for the TUI.
 */

import { TextAttributes } from "@opentui/core";
import { For, Show } from "solid-js";
import type { TodoItem } from "../../tools/tool.ts";
import type { ThemeColors } from "../appearance/theme.ts";
import { formatTodoSummary } from "./todo-summary.ts";

/**
 * Props for the composer todo dropup.
 */
export interface TodoDropupProps {
  readonly open: boolean;
  readonly todos: readonly TodoItem[];
  readonly theme: ThemeColors;
}

/**
 * Render the open todo panel above the composer input.
 */
export function TodoDropup(props: TodoDropupProps) {
  const sortedTodos = () => sortTodosForDisplay(props.todos).slice(0, 6);
  const hiddenCount = () => Math.max(0, props.todos.length - sortedTodos().length);
  const summary = () => formatTodoSummary(props.todos);

  return (
    <Show when={props.open && props.todos.length > 0}>
      <box
        flexDirection="column"
        border
        borderColor={props.theme.promptBorder}
        backgroundColor={props.theme.inverseText}
        marginBottom={1}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={0}
        paddingBottom={0}
        flexShrink={0}
      >
        <box flexDirection="row" justifyContent="space-between" alignItems="center">
          <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Todos</text>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{summary()}</text>
        </box>
        <For each={sortedTodos()}>
          {(todo) => <TodoDropupLine todo={todo} theme={props.theme} />}
        </For>
        <Show when={hiddenCount() > 0}>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{`… ${hiddenCount()} more`}</text>
        </Show>
        <box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>Ctrl+T or /todos toggles</text>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>esc close</text>
        </box>
      </box>
    </Show>
  );
}

function TodoDropupLine(props: { readonly todo: TodoItem; readonly theme: ThemeColors }) {
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
    ? props.theme.success
    : props.todo.status === "cancelled"
      ? props.theme.hintText
      : props.todo.priority === "high"
        ? props.theme.warning
        : props.theme.assistantBody;
  const label = () => props.todo.status === "in_progress" ? props.todo.activeForm : props.todo.content;

  return (
    <box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0}>
      <box width={4} flexShrink={0}>
        <text fg={color()}>{`[${marker()}] `}</text>
      </box>
      <box width={7} flexShrink={0}>
        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{toShortPriority(props.todo.priority)}</text>
      </box>
      <box flexGrow={1} flexShrink={1} minWidth={0}>
        <text fg={color()}>{truncate(label(), 96)}</text>
      </box>
    </box>
  );
}

function sortTodosForDisplay(todos: readonly TodoItem[]): readonly TodoItem[] {
  return [...todos].sort((left, right) => {
    const statusDifference = statusRank(left.status) - statusRank(right.status);
    if (statusDifference !== 0) {
      return statusDifference;
    }

    return priorityRank(left.priority) - priorityRank(right.priority);
  });
}

function statusRank(status: TodoItem["status"]): number {
  switch (status) {
    case "in_progress":
      return 0;
    case "pending":
      return 1;
    case "completed":
      return 2;
    case "cancelled":
      return 3;
  }
}

function priorityRank(priority: TodoItem["priority"]): number {
  switch (priority) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
  }
}

function toShortPriority(priority: TodoItem["priority"]): string {
  switch (priority) {
    case "high":
      return "high";
    case "medium":
      return "med";
    case "low":
      return "low";
  }
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}
