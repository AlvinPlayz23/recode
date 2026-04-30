/**
 * Customize overlay for the TUI.
 */

import { For, Show } from "solid-js";
import { TextAttributes } from "@opentui/core";
import { normalizeBuiltinCommandSelectionIndex } from "./message-format.ts";
import type { ThemeColors } from "./theme.ts";
import type { CustomizeRow } from "./tui-app-types.ts";

/**
 * Props for the customize overlay.
 */
export interface CustomizeOverlayProps {
  readonly open: boolean;
  readonly rows: readonly CustomizeRow[];
  readonly selectedRow: number;
  readonly theme: ThemeColors;
}

/**
 * Render the customize overlay.
 */
export function CustomizeOverlay(props: CustomizeOverlayProps) {
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
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Customize</text>
        <text fg={props.theme.hintText}>Use ↑/↓ to choose a row. Use ←/→ or Space to cycle. Press Enter or ESC to close.</text>
        <box flexDirection="column" marginTop={1}>
          <For each={props.rows}>
            {(row, index) => {
              const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                props.selectedRow,
                props.rows.length
              );

              return (
                <box flexDirection="column" marginBottom={1} paddingLeft={1} paddingRight={1}>
                  <text
                    fg={selected() ? props.theme.brandShimmer : props.theme.text}
                    attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                  >
                    {`${selected() ? "› " : "  "}${row.label.padEnd(12, " ")} < ${row.option.value === ""
                      ? row.option.label
                      : `${row.option.label} ${row.option.value}`} >`}
                  </text>
                  <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{row.description}</text>
                </box>
              );
            }}
          </For>
        </box>
      </box>
    </Show>
  );
}
