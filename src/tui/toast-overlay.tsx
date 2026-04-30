/**
 * Toast overlay for the TUI.
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
 * Render a transient toast overlay.
 */
export function ToastOverlay(props: ToastOverlayProps) {
  return (
    <Show when={props.toast !== undefined}>
      <box
        position="absolute"
        right={3}
        top={2}
        maxWidth={props.maxWidth}
        border
        borderColor={props.theme.success}
        backgroundColor={props.theme.userMessageBackground}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        <text fg={props.theme.success} attributes={TextAttributes.BOLD} wrapMode="word" width="100%">
          {props.toast?.message ?? ""}
        </text>
      </box>
    </Show>
  );
}
