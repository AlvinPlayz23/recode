/**
 * History-picker overlay for the TUI.
 */

import { InputRenderable, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { createEffect, For, Show } from "solid-js";
import { formatRelativeTimestamp, type HistoryPickerItem } from "./history-picker.ts";
import {
  getIndexedPickerChildId
} from "./selector-navigation.ts";
import { normalizeBuiltinCommandSelectionIndex } from "./message-format.ts";
import { Spinner } from "./spinner.tsx";
import type { ThemeColors, ThemeName } from "./theme.ts";

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
  const detailWidth = () => Math.max(20, props.terminalWidth - 16);
  const listViewportHeight = () => Math.min(props.popupHeight, Math.max(2, props.items.length * 2));
  const renderInstanceId = () => hashHistoryRenderKey(props.renderKey);
  const useScrollbox = () => props.items.length * 2 > props.popupHeight;

  createEffect(() => {
    if (!useScrollbox()) {
      props.bindScrollBoxRef(undefined);
    }
  });

  return (
    <Show when={props.open}>
      <box
        position="absolute"
        left={3}
        right={3}
        bottom={1}
        zIndex={2000}
        flexDirection="column"
        border
        borderColor={props.theme.brandShimmer}
        backgroundColor={props.theme.bashMessageBackgroundColor}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        flexShrink={0}
      >
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Conversation History</text>
        <text fg={props.theme.hintText}>Type to filter. Use arrows to navigate. Press Enter to restore. Press ESC to close.</text>
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
                          detailWidth(),
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
                        detailWidth(),
                        renderInstanceId()
                      )}
                    </For>
                  </scrollbox>
                </Show>
              )}
            </Show>
          </Show>
        </Show>
      </box>
    </Show>
  );
}

function renderHistoryPickerRow(
  props: HistoryPickerOverlayProps,
  item: HistoryPickerItem,
  index: () => number,
  detailWidth: number,
  renderInstanceId: string
) {
  const actualIndex = () => index();
  const selected = () => actualIndex() === normalizeBuiltinCommandSelectionIndex(
    props.selectedIndex,
    props.totalOptionCount
  );

  return (
    <box
      id={getIndexedPickerChildId(`history-picker-item-${renderInstanceId}`, actualIndex(), props.items.length)}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      flexShrink={0}
    >
      <text
        fg={selected() ? props.theme.brandShimmer : props.theme.text}
        attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
      >
        {truncateInlineText(`${selected() ? "›" : " "} ${item.title}${item.current ? " (current)" : ""}`, detailWidth)}
      </text>
      <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
        {truncateInlineText(
          `${item.providerName} · ${item.model} · ${formatRelativeTimestamp(item.updatedAt)} · ${item.preview}`,
          detailWidth
        )}
      </text>
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

function hashHistoryRenderKey(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  return Math.abs(hash).toString(36);
}
