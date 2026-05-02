/**
 * Customize overlay for the TUI.
 */

import { For, Show } from "solid-js";
import { RGBA, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
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
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Customize</text>
        <text fg={props.theme.hintText}>↑/↓ to choose row  ·  ◀ ←/→ or Space ▶ to cycle  ·  Enter or ESC to close</text>
        <box flexDirection="column" marginTop={1}>
          <For each={props.rows}>
            {(row, index) => {
              const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                props.selectedRow,
                props.rows.length
              );

              return (
                <box flexDirection="column" marginBottom={1} paddingLeft={1} paddingRight={1}>
                  <box flexDirection="row" alignItems="center" gap={1}>
                    <text
                      fg={selected() ? props.theme.brandShimmer : props.theme.text}
                      attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                    >
                      {`${selected() ? "›" : " "} ${row.label.padEnd(12, " ")}`}
                    </text>
                    <text fg={selected() ? props.theme.inactive : props.theme.divider}>◀</text>
                    <text
                      fg={selected() ? props.theme.brandShimmer : props.theme.text}
                      attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                    >
                      {row.option.value === ""
                        ? row.option.label
                        : `${row.option.label} ${row.option.value}`}
                    </text>
                    <text fg={selected() ? props.theme.inactive : props.theme.divider}>▶</text>
                  </box>
                  <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{row.description}</text>
                </box>
              );
            }}
          </For>
        </box>
      </box>
      </box>
    </Show>
  );
}
