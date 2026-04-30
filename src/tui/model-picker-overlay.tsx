/**
 * Model-picker overlay for the TUI.
 */

import { InputRenderable, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { For, Show } from "solid-js";
import {
  getIndexedPickerChildId,
  type ModelPickerRenderedLine
} from "./selector-navigation.ts";
import { Spinner } from "./spinner.tsx";
import type { ThemeColors, ThemeName } from "./theme.ts";

/**
 * Props for the model-picker overlay.
 */
export interface ModelPickerOverlayProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly query: string;
  readonly optionsCount: number;
  readonly renderedLines: readonly ModelPickerRenderedLine[];
  readonly popupHeight: number;
  readonly theme: ThemeColors;
  readonly themeName: ThemeName;
  readonly bindInputRef: (value: InputRenderable) => void;
  readonly bindScrollBoxRef: (value: ScrollBoxRenderable) => void;
  readonly onQueryInput: (value: string) => void;
}

/**
 * Render the model-picker overlay.
 */
export function ModelPickerOverlay(props: ModelPickerOverlayProps) {
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
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Model Selector</text>
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
            placeholder={props.busy ? "Loading models..." : "Filter models or type a custom ID for the active provider..."}
            onInput={props.onQueryInput}
          />
        </box>
        <Show
          when={!props.busy}
          fallback={<box marginTop={1}><Spinner verb="loading models" theme={props.theme} themeName={props.themeName} /></box>}
        >
          <Show
            when={props.optionsCount > 0}
            fallback={<text fg={props.theme.hintText}>No models match the current filter. Type a custom ID for the active provider to add one.</text>}
          >
            <scrollbox
              ref={props.bindScrollBoxRef}
              height={props.popupHeight}
              scrollY
            >
              <For each={props.renderedLines}>
                {(line, index) => (
                  <box id={getIndexedPickerChildId("model-picker-line", index(), props.renderedLines.length)}>
                    <text
                      fg={line.selected ? props.theme.brandShimmer : line.kind === "group" ? props.theme.text : props.theme.assistantBody}
                      attributes={line.kind === "group"
                        ? TextAttributes.BOLD
                        : line.selected
                          ? TextAttributes.BOLD
                          : TextAttributes.NONE}
                    >
                      {line.text}
                    </text>
                  </box>
                )}
              </For>
            </scrollbox>
          </Show>
        </Show>
      </box>
    </Show>
  );
}
