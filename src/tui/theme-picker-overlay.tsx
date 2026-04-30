/**
 * Theme-picker overlay for the TUI.
 */

import { InputRenderable, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { For, Show } from "solid-js";
import { normalizeBuiltinCommandSelectionIndex } from "./message-format.ts";
import { getIndexedPickerChildId } from "./selector-navigation.ts";
import type { ThemeColors } from "./theme.ts";
import type { ThemePickerItem } from "./tui-app-types.ts";

/**
 * Props for the theme-picker overlay.
 */
export interface ThemePickerOverlayProps {
  readonly open: boolean;
  readonly query: string;
  readonly items: readonly ThemePickerItem[];
  readonly selectedIndex: number;
  readonly totalOptionCount: number;
  readonly popupHeight: number;
  readonly theme: ThemeColors;
  readonly bindInputRef: (value: InputRenderable) => void;
  readonly bindScrollBoxRef: (value: ScrollBoxRenderable) => void;
  readonly onQueryInput: (value: string) => void;
}

/**
 * Render the theme-picker overlay.
 */
export function ThemePickerOverlay(props: ThemePickerOverlayProps) {
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
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Theme Selector</text>
        <text fg={props.theme.hintText}>Type to filter. Use arrows to navigate. Press Enter to select. Press ESC to close.</text>
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
            placeholder="Filter themes..."
            onInput={props.onQueryInput}
          />
        </box>
        <Show
          when={props.items.length > 0}
          fallback={<text fg={props.theme.hintText}>No themes match the current filter.</text>}
        >
          <scrollbox
            ref={props.bindScrollBoxRef}
            height={props.popupHeight}
            scrollY
          >
            <For each={props.items}>
              {(item, index) => {
                const actualIndex = () => index();
                const selected = () => actualIndex() === normalizeBuiltinCommandSelectionIndex(
                  props.selectedIndex,
                  props.totalOptionCount
                );

                return (
                  <box
                    id={getIndexedPickerChildId("theme-picker-item", actualIndex(), props.items.length)}
                    flexDirection="column"
                    marginBottom={1}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text
                      fg={selected() ? props.theme.brandShimmer : props.theme.text}
                      attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                    >
                      {`${selected() ? "›" : " "} ${item.label}${item.active ? " (current)" : ""}`}
                    </text>
                    <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{item.description}</text>
                  </box>
                );
              }}
            </For>
          </scrollbox>
        </Show>
      </box>
    </Show>
  );
}
