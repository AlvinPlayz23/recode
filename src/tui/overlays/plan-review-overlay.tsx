/**
 * Plan review overlay for approving or revising a completed plan.
 */

import { For, Show } from "solid-js";
import { RGBA, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { normalizeBuiltinCommandSelectionIndex } from "../message-format.ts";
import type { ActivePlanReviewRequest, PlanReviewOption } from "../session/plan-review.ts";
import type { ThemeColors } from "../appearance/theme.ts";

/**
 * Props for the plan-review overlay.
 */
export interface PlanReviewOverlayProps {
  readonly request: ActivePlanReviewRequest | undefined;
  readonly options: readonly PlanReviewOption[];
  readonly theme: ThemeColors;
}

/**
 * Render the plan-review overlay.
 */
export function PlanReviewOverlay(props: PlanReviewOverlayProps) {
  const terminal = useTerminalDimensions();
  return (
    <Show when={props.request !== undefined}>
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
        width={Math.min(terminal().width - 6, 74)}
        flexDirection="column"
        border
        borderColor={props.theme.brandShimmer}
        backgroundColor={props.theme.inverseText}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        <box flexDirection="row" alignItems="center" gap={1} marginBottom={1}>
          <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>◆</text>
          <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Plan Ready</text>
        </box>

        <Show when={props.request}>
          {(request: () => ActivePlanReviewRequest) => (
            <>
              <box
                flexDirection="column"
                border
                borderColor={props.theme.promptBorder}
                paddingLeft={1}
                paddingRight={1}
                paddingTop={1}
                paddingBottom={1}
                marginBottom={1}
              >
                <text fg={props.theme.text} attributes={TextAttributes.BOLD}>Recode presented a plan for approval.</text>
                <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                  Choose whether to implement it now or keep refining in PLAN mode.
                </text>
              </box>

              <For each={props.options}>
                {(option, index) => {
                  const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                    request().selectedIndex,
                    props.options.length
                  );
                  const color = () => selected() ? props.theme.brandShimmer : props.theme.inactive;

                  return (
                    <box flexDirection="row" gap={1} paddingLeft={1} marginBottom={1}>
                      <text fg={color()} attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}>
                        {selected() ? "›" : " "}
                      </text>
                      <box flexDirection="column">
                        <text fg={color()} attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}>
                          {option.label}
                        </text>
                        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                          {option.description}
                        </text>
                      </box>
                    </box>
                  );
                }}
              </For>

              <text fg={props.theme.hintText} attributes={TextAttributes.DIM} marginTop={1}>
                ↑↓ navigate  ·  Enter confirm  ·  ESC keep planning
              </text>
            </>
          )}
        </Show>
      </box>
      </box>
    </Show>
  );
}
