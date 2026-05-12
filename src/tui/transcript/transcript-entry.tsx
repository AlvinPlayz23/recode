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
import type { JSX } from "solid-js";
import type { EditToolResultMetadata } from "../../tools/tool.ts";
import { toDisplayLines } from "../message-format.ts";
import {
  getTheme,
  type LayoutMode
} from "../appearance/theme.ts";
import type { UiEntry } from "./transcript-entry-state.ts";
import {
  countDiffLines,
  renderToolPreviewContent
} from "./tool-renderer-registry.tsx";

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

export { countDiffLines } from "./tool-renderer-registry.tsx";

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
      const counts = editMetadata !== undefined
        ? countDiffLines(editMetadata.oldText ?? "", editMetadata.newText ?? "")
        : undefined;
      const summary = counts !== undefined
        ? `+${counts.added} −${counts.removed}`
        : undefined;
      const showHeaderSummary = metadata?.kind !== "edit-preview";

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
            <Show when={summary !== undefined && showHeaderSummary}>
              <box flexShrink={0} paddingLeft={2}>
                <text fg={t().diffAdded} attributes={TextAttributes.BOLD}>{`+${counts?.added ?? 0}`}</text>
                <text fg={t().hintText} attributes={TextAttributes.DIM}> </text>
                <text fg={t().diffRemoved} attributes={TextAttributes.BOLD}>{`−${counts?.removed ?? 0}`}</text>
              </box>
            </Show>
          </box>
          <Show when={metadata !== undefined}>
            {metadata === undefined ? undefined : renderToolPreviewContent({ entry, metadata, theme: t })}
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
        <ErrorBlock entry={entry} theme={t} compact={compact()} />
      );

    case "status":
      return (
        <box flexDirection="row" marginTop={0} marginBottom={0} paddingLeft={3}>
          <text fg={t().statusText} attributes={TextAttributes.DIM}>◌ {entry.body}</text>
        </box>
      );
  }
}

function ErrorBlock(props: {
  readonly entry: UiEntry;
  readonly theme: () => ReturnType<typeof getTheme>;
  readonly compact: boolean;
}): JSX.Element {
  return (
    <box
      flexDirection="column"
      marginTop={props.compact ? 0 : 1}
      marginLeft={3}
      marginRight={2}
      paddingLeft={1}
      paddingRight={1}
      border
      borderStyle="single"
      borderColor={props.theme().error}
      backgroundColor={props.theme().bashMessageBackgroundColor}
      title="Tool error"
      titleAlignment="left"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
    >
      <box flexDirection="row" alignItems="center">
        <text fg={props.theme().error} attributes={TextAttributes.BOLD}>✗ </text>
        <box flexGrow={1} flexShrink={1} minWidth={0}>
          <For each={toDisplayLines(props.entry.body)}>
            {(line) => <text fg={props.theme().error}>{line}</text>}
          </For>
        </box>
      </box>
    </box>
  );
}
