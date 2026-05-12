/**
 * Approval-mode overlay for the TUI.
 */

import { For, Show } from "solid-js";
import { RGBA, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { normalizeBuiltinCommandSelectionIndex } from "../message-format.ts";
import { getIndexedPickerChildId } from "../pickers/selector-navigation.ts";
import type { ThemeColors } from "../appearance/theme.ts";
import type { ApprovalModePickerItem } from "../tui-app-types.ts";

/**
 * Props for the approval-mode overlay.
 */
export interface ApprovalModeOverlayProps {
  readonly open: boolean;
  readonly items: readonly ApprovalModePickerItem[];
  readonly selectedIndex: number;
  readonly totalOptionCount: number;
  readonly popupHeight: number;
  readonly theme: ThemeColors;
  readonly bindScrollBoxRef: (value: ScrollBoxRenderable) => void;
}

/**
 * Render the approval-mode overlay.
 */
export function ApprovalModeOverlay(props: ApprovalModeOverlayProps) {
  const terminal = useTerminalDimensions();
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
        width={Math.min(terminal().width - 6, 72)}
        flexDirection="column"
        border
        borderColor={props.theme.brandShimmer}
        backgroundColor={props.theme.inverseText}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Approval Mode</text>
        <text fg={props.theme.hintText}>Use arrows to navigate. Press Enter to select. Press ESC to close.</text>
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
                  id={getIndexedPickerChildId("approval-mode-picker-item", actualIndex(), props.items.length)}
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
      </box>
    </Show>
  );
}
