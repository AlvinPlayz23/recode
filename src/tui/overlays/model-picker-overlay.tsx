/**
 * Model-picker overlay for the TUI.
 */

import { InputRenderable, RGBA, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { For, Show } from "solid-js";
import {
  getIndexedPickerChildId,
  type ModelPickerRenderedLine
} from "../pickers/selector-navigation.ts";
import { Spinner } from "../appearance/spinner.tsx";
import type { ThemeColors, ThemeName } from "../appearance/theme.ts";

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
        width={Math.min(terminal().width - 6, 88)}
        flexDirection="column"
        border
        borderColor={props.theme.brandShimmer}
        backgroundColor={props.theme.inverseText}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        {/* Header row */}
        <box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
          <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Model Selector</text>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>↑↓ navigate  ·  Enter select  ·  ESC close</text>
        </box>

        {/* Search input */}
        <box
          flexDirection="row"
          alignItems="center"
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
            placeholder={props.busy ? "Loading models..." : "Filter by name or paste a custom model ID..."}
            onInput={props.onQueryInput}
          />
        </box>

        <Show
          when={!props.busy}
          fallback={<box marginTop={1}><Spinner verb="loading models" theme={props.theme} themeName={props.themeName} /></box>}
        >
          <Show
            when={props.optionsCount > 0}
            fallback={
              <text fg={props.theme.hintText}>
                No models match the filter. Type a custom ID to use it directly with the active provider.
              </text>
            }
          >
            <scrollbox
              ref={props.bindScrollBoxRef}
              height={props.popupHeight}
              scrollY
            >
              <For each={props.renderedLines}>
                {(line, index) => {
                  const isGroup = line.kind === "group";

                  return (
                    <box
                      id={getIndexedPickerChildId("model-picker-line", index(), props.renderedLines.length)}
                      flexDirection="row"
                      alignItems="center"
                      marginTop={isGroup ? 1 : 0}
                    >
                      {isGroup
                        ? (
                          <>
                            <text fg={props.theme.divider}>── </text>
                            <text fg={props.theme.brand} attributes={TextAttributes.BOLD}>{line.text}</text>
                            <text fg={props.theme.divider}> ──</text>
                          </>
                        )
                        : (
                          <text
                            fg={line.selected ? props.theme.brandShimmer : props.theme.assistantBody}
                            attributes={line.selected ? TextAttributes.BOLD : TextAttributes.NONE}
                          >
                            {line.text}
                          </text>
                        )}
                    </box>
                  );
                }}
              </For>
            </scrollbox>
          </Show>
        </Show>
      </box>
      </box>
    </Show>
  );
}
