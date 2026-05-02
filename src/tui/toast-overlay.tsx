/**
 * Toast overlay for the TUI.
 *
 * Anchored to the bottom-right corner so transient feedback never steals focus
 * from the composer or transcript flow.
 */

import { Show } from "solid-js";
import { TextAttributes } from "@opentui/core";
import type { ThemeColors } from "./theme.ts";
import type { ActiveToast } from "./tui-app-types.ts";

/**
 * Props for the toast overlay.
 */
export interface ToastOverlayProps {
  readonly toast: ActiveToast | undefined;
  readonly maxWidth: number;
  readonly theme: ThemeColors;
}

/**
 * Render a transient toast overlay anchored to the bottom-right corner.
 */
export function ToastOverlay(props: ToastOverlayProps) {
  return (
    <Show when={props.toast !== undefined}>
      <box
        position="absolute"
        right={3}
        bottom={2}
        zIndex={3000}
        maxWidth={props.maxWidth}
        border
        borderColor={props.theme.divider}
        backgroundColor={props.theme.inverseText}
        paddingLeft={1}
        paddingRight={1}
      >
        <box flexDirection="row" alignItems="center">
          <text fg={props.theme.success} attributes={TextAttributes.BOLD}>✓ </text>
          <box flexGrow={1} flexShrink={1} minWidth={0}>
            <text fg={props.theme.text} wrapMode="word" width="100%">
              {props.toast?.message ?? ""}
            </text>
          </box>
        </box>
      </box>
    </Show>
  );
}
