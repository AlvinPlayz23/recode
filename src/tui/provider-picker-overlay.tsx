/**
 * Provider-picker overlay for the TUI.
 */

import { RGBA, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { For, Show } from "solid-js";
import { getIndexedPickerChildId } from "./selector-navigation.ts";
import type { ThemeColors } from "./theme.ts";
import type { ProviderPickerItem } from "./provider-picker.ts";

/**
 * Props for the provider-picker overlay.
 */
export interface ProviderPickerOverlayProps {
  readonly open: boolean;
  readonly items: readonly ProviderPickerItem[];
  readonly selectedIndex: number;
  readonly totalOptionCount: number;
  readonly popupHeight: number;
  readonly theme: ThemeColors;
  readonly bindScrollBoxRef: (value: ScrollBoxRenderable) => void;
}

/**
 * Render the provider manager overlay.
 */
export function ProviderPickerOverlay(props: ProviderPickerOverlayProps) {
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
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Provider Manager</text>
        <text fg={props.theme.hintText}>Use arrows to navigate. Enter selects. Space enables/disables. ESC closes.</text>
        <Show
          when={props.items.length > 0}
          fallback={<text fg={props.theme.hintText}>No providers are configured yet. Run `recode setup` first.</text>}
        >
          <scrollbox
            ref={props.bindScrollBoxRef}
            height={props.popupHeight}
            scrollY
            marginTop={1}
          >
            <For each={props.items}>
              {(item, index) => {
                const selected = () => index() === props.selectedIndex;
                const disabled = () => item.disabled;
                return (
                  <box
                    id={getIndexedPickerChildId("provider-picker-item", index(), props.totalOptionCount)}
                    flexDirection="column"
                    marginBottom={1}
                  >
                    <text
                      fg={selected()
                        ? props.theme.brandShimmer
                        : disabled()
                          ? props.theme.hintText
                          : props.theme.text}
                      attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                    >
                      {`${selected() ? "›" : " "} ${item.providerName}${item.active ? " (active)" : ""}${item.disabled ? " (disabled)" : ""}`}
                    </text>
                    <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                      {`${item.providerKind} · ${item.defaultModelId ?? "no default model"}`}
                    </text>
                    <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                      {item.baseUrl}
                    </text>
                  </box>
                );
              }}
            </For>
          </scrollbox>
        </Show>
      </box>
      </box>
    </Show>
  );
}
