/**
 * History-picker overlay for the TUI.
 *
 * Compact single-line rows: relative-time · mode · title · meta. Inspired by
 * fzf-style session pickers in opencode and pi.
 */

import { InputRenderable, RGBA, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { createEffect, For, Show } from "solid-js";
import { formatRelativeTimestamp, type HistoryPickerItem } from "../pickers/history-picker.ts";
import {
  getIndexedPickerChildId
} from "../pickers/selector-navigation.ts";
import { normalizeBuiltinCommandSelectionIndex } from "../message-format.ts";
import { Spinner } from "../appearance/spinner.tsx";
import type { ThemeColors, ThemeName } from "../appearance/theme.ts";

/**
 * Props for the history-picker overlay.
 */
export interface HistoryPickerOverlayProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly query: string;
  readonly items: readonly HistoryPickerItem[];
  readonly selectedIndex: number;
  readonly totalOptionCount: number;
  readonly renderKey: string;
  readonly popupHeight: number;
  readonly terminalWidth: number;
  readonly theme: ThemeColors;
  readonly themeName: ThemeName;
  readonly bindInputRef: (value: InputRenderable) => void;
  readonly bindScrollBoxRef: (value: ScrollBoxRenderable | undefined) => void;
  readonly onQueryInput: (value: string) => void;
}

/**
 * Render the history-picker overlay.
 */
export function HistoryPickerOverlay(props: HistoryPickerOverlayProps) {
  const terminal = useTerminalDimensions();
  const rowWidth = () => Math.max(40, props.terminalWidth - 12);
  const listViewportHeight = () => Math.min(props.popupHeight, Math.max(2, props.items.length));
  const renderInstanceId = () => hashHistoryRenderKey(props.renderKey);
  const useScrollbox = () => props.items.length > props.popupHeight;

  createEffect(() => {
    if (!useScrollbox()) {
      props.bindScrollBoxRef(undefined);
    }
  });

  return (
    <Show when={props.open}>
      <box
        position="absolute"
        left={0}
        top={0}
        width={terminal().width}
        height={terminal().height}
        zIndex={2000}
        backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
        alignItems="center"
        paddingTop={Math.floor(terminal().height / 4)}
      >
      <box
        width={Math.min(terminal().width - 6, 96)}
        flexDirection="column"
        border
        borderColor={props.theme.brandShimmer}
        backgroundColor={props.theme.inverseText}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={0}
        paddingBottom={0}
      >
        <box flexDirection="row" alignItems="center" justifyContent="space-between">
          <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>history</text>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
            {props.items.length} session{props.items.length === 1 ? "" : "s"}
          </text>
        </box>
        <box
          flexDirection="row"
          alignItems="center"
          marginTop={1}
          marginBottom={1}
          border
          borderColor={props.theme.promptBorder}
          paddingLeft={1}
          paddingRight={1}
        >
          <text fg={props.theme.brandShimmer}>⌕ </text>
          <input
            ref={props.bindInputRef}
            focused={props.open}
            value={props.query}
            flexGrow={1}
            placeholder={props.busy ? "Loading conversations..." : "Filter by title, preview, provider, or model..."}
            onInput={props.onQueryInput}
          />
        </box>
        <Show
          when={!props.busy}
          fallback={<box marginTop={1}><Spinner verb="loading history" theme={props.theme} themeName={props.themeName} /></box>}
        >
          <Show
            when={props.items.length > 0}
            fallback={<text fg={props.theme.hintText}>No saved conversations match the current filter.</text>}
          >
            <Show when={props.renderKey} keyed>
              {() => (
                <Show
                  when={useScrollbox()}
                  fallback={
                    <box flexDirection="column">
                      <For each={props.items}>
                        {(item, index) => renderHistoryPickerRow(
                          props,
                          item,
                          index,
                          rowWidth(),
                          renderInstanceId()
                        )}
                      </For>
                    </box>
                  }
                >
                  <scrollbox
                    id={`history-picker-results-${renderInstanceId()}`}
                    ref={props.bindScrollBoxRef}
                    height={listViewportHeight()}
                    scrollY
                  >
                    <For each={props.items}>
                      {(item, index) => renderHistoryPickerRow(
                        props,
                        item,
                        index,
                        rowWidth(),
                        renderInstanceId()
                      )}
                    </For>
                  </scrollbox>
                </Show>
              )}
            </Show>
          </Show>
        </Show>
        <box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
            ↑↓ select · ↵ open · / filter
          </text>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
            esc close
          </text>
        </box>
      </box>
      </box>
    </Show>
  );
}

function renderHistoryPickerRow(
  props: HistoryPickerOverlayProps,
  item: HistoryPickerItem,
  index: () => number,
  rowWidth: number,
  renderInstanceId: string
) {
  const actualIndex = () => index();
  const selected = () => actualIndex() === normalizeBuiltinCommandSelectionIndex(
    props.selectedIndex,
    props.totalOptionCount
  );

  const timeColumn = () => padRight(formatCompactRelative(item.updatedAt), 5);
  const modeColumn = () => padRight(formatModeBadge(item.providerName, item.model), 12);
  const metaColumn = () => formatMetaSummary(item);

  const titleBudget = () => Math.max(
    8,
    rowWidth - timeColumn().length - modeColumn().length - metaColumn().length - 6
  );
  const titleText = () => truncateInlineText(
    `${item.title}${item.current ? "  (current)" : ""}`,
    titleBudget()
  );

  return (
    <box
      id={getIndexedPickerChildId(`history-picker-item-${renderInstanceId}`, actualIndex(), props.items.length)}
      flexDirection="row"
      alignItems="center"
      paddingLeft={0}
      paddingRight={0}
      flexShrink={0}
    >
      <text
        fg={selected() ? props.theme.brandShimmer : props.theme.hintText}
        attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
      >
        {selected() ? "› " : "  "}
      </text>
      <box width={5} flexShrink={0}>
        <text fg={selected() ? props.theme.brandShimmer : props.theme.hintText} attributes={TextAttributes.DIM}>
          {timeColumn()}
        </text>
      </box>
      <text fg={props.theme.divider} attributes={TextAttributes.DIM}> </text>
      <box width={12} flexShrink={0}>
        <text fg={selected() ? props.theme.brandShimmer : props.theme.tool}>
          {modeColumn()}
        </text>
      </box>
      <text fg={props.theme.divider} attributes={TextAttributes.DIM}> </text>
      <box flexGrow={1} flexShrink={1} minWidth={0}>
        <text
          fg={selected() ? props.theme.brandShimmer : props.theme.text}
          attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
        >
          {titleText()}
        </text>
      </box>
      <box flexShrink={0}>
        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
          {metaColumn()}
        </text>
      </box>
    </box>
  );
}

function truncateInlineText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 1) {
    return "…";
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function padRight(value: string, width: number): string {
  if (value.length >= width) {
    return value;
  }
  return value + " ".repeat(width - value.length);
}

function formatModeBadge(providerName: string, model: string): string {
  const label = `${providerName} · ${model}`.trim();
  return truncateInlineText(label, 12);
}

function formatMetaSummary(item: HistoryPickerItem): string {
  const preview = (item.preview ?? "").trim().replace(/\s+/g, " ");
  if (preview === "") {
    return "";
  }
  return truncateInlineText(preview, 32);
}

/**
 * Format a saved timestamp as a compact relative string (e.g. "2m", "1h", "3d").
 */
export function formatCompactRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "·";
  }

  const diffMs = Date.now() - date.valueOf();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w`;
  }

  return formatRelativeTimestamp(value).split(",")[0] ?? value;
}

function hashHistoryRenderKey(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  return Math.abs(hash).toString(36);
}
