/**
 * Transcript entry renderer for the TUI.
 */

import {
  TextAttributes,
  type SyntaxStyle
} from "@opentui/core";
import { For, Show } from "solid-js";
import type { EditToolResultMetadata } from "../tools/tool.ts";
import { toDisplayLines } from "./message-format.ts";
import {
  getTheme,
  type LayoutMode
} from "./theme.ts";
import type { UiEntry } from "./transcript-entry-state.ts";

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

    case "tool":
      return (
        <box flexDirection="row" paddingLeft={4} marginTop={0} marginBottom={0}>
          <text fg={t().tool} attributes={TextAttributes.DIM}>{toolMarker()} </text>
          <text fg={t().tool} attributes={TextAttributes.DIM}>{entry.body}</text>
        </box>
      );

    case "tool-preview": {
      const metadata = entry.metadata;
      return (
        <box flexDirection="column" paddingLeft={4} marginTop={compact() ? 0 : 1} marginBottom={0}>
          <box flexDirection="row">
            <text fg={t().tool} attributes={TextAttributes.DIM}>{toolMarker()} </text>
            <text fg={t().tool} attributes={TextAttributes.DIM}>{entry.body}</text>
          </box>
          <Show when={metadata?.kind === "edit-preview"}>
            <box paddingLeft={2} paddingTop={1} paddingRight={1}>
              <diff
                oldCode={(metadata as EditToolResultMetadata | undefined)?.oldText ?? ""}
                newCode={(metadata as EditToolResultMetadata | undefined)?.newText ?? ""}
                language={resolveDiffLanguage((metadata as EditToolResultMetadata | undefined)?.path ?? "")}
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
        </box>
      );
    }

    case "tool-group":
      return (
        <box flexDirection="row" paddingLeft={4} marginTop={0} marginBottom={0}>
          <text fg={t().tool} attributes={TextAttributes.DIM}>{toolMarker()} </text>
          <text fg={t().tool} attributes={TextAttributes.DIM}>{entry.body}</text>
        </box>
      );

    case "error":
      return (
        <box flexDirection="column" marginTop={compact() ? 0 : 1} paddingLeft={3}>
          <text fg={t().error}>⚠ {entry.body}</text>
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
