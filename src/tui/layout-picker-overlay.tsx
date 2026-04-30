/**
 * Layout-picker overlay for the TUI.
 */

import { For, Show } from "solid-js";
import { type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { normalizeBuiltinCommandSelectionIndex } from "./message-format.ts";
import { getIndexedPickerChildId } from "./selector-navigation.ts";
import type { ThemeColors } from "./theme.ts";
import type { LayoutPickerItem } from "./tui-app-types.ts";

/**
 * Props for the layout-picker overlay.
 */
export interface LayoutPickerOverlayProps {
  readonly open: boolean;
  readonly items: readonly LayoutPickerItem[];
  readonly selectedIndex: number;
  readonly totalOptionCount: number;
  readonly popupHeight: number;
  readonly theme: ThemeColors;
  readonly bindScrollBoxRef: (value: ScrollBoxRenderable) => void;
}

/**
 * Render the layout-picker overlay.
 */
export function LayoutPickerOverlay(props: LayoutPickerOverlayProps) {
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
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Layout &amp; Density</text>
        <text fg={props.theme.hintText}>Use arrows to navigate. Press Enter to toggle. Press ESC to close.</text>
        <scrollbox
          ref={props.bindScrollBoxRef}
          height={props.popupHeight}
          scrollY
          marginTop={1}
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
                  id={getIndexedPickerChildId("layout-picker-item", actualIndex(), props.items.length)}
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
      </box>
    </Show>
  );
}
