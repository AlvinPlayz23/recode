/**
 * Tool-approval overlay for the TUI.
 */

import { For, Show } from "solid-js";
import { TextAttributes } from "@opentui/core";
import { normalizeBuiltinCommandSelectionIndex } from "./message-format.ts";
import type { ToolApprovalDecision } from "../tools/tool.ts";
import type { ThemeColors } from "./theme.ts";
import type { ActiveApprovalRequest } from "./tui-app-types.ts";

/**
 * One approval decision displayed in the approval overlay.
 */
export interface ApprovalDecisionOption {
  readonly decision: ToolApprovalDecision;
  readonly label: string;
  readonly description: string;
}

/**
 * Props for the tool-approval overlay.
 */
export interface ToolApprovalOverlayProps {
  readonly request: ActiveApprovalRequest | undefined;
  readonly decisions: readonly ApprovalDecisionOption[];
  readonly theme: ThemeColors;
  readonly formatTitle: (request: ActiveApprovalRequest) => string;
  readonly formatDescription: (request: ActiveApprovalRequest) => string;
}

/**
 * Render the tool-approval overlay.
 */
export function ToolApprovalOverlay(props: ToolApprovalOverlayProps) {
  return (
    <Show when={props.request !== undefined}>
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
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Approve Tool Action</text>
        <Show when={props.request}>
          {(request: () => ActiveApprovalRequest) => (
            <>
              <text fg={props.theme.text}>{props.formatTitle(request())}</text>
              <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                {props.formatDescription(request())}
              </text>
              <box
                flexDirection="column"
                border
                borderColor={props.theme.promptBorder}
                marginTop={1}
                paddingLeft={1}
                paddingRight={1}
              >
                <For each={props.decisions}>
                  {(decision, index) => {
                    const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                      request().selectedIndex,
                      props.decisions.length
                    );

                    return (
                      <box flexDirection="column" marginBottom={1}>
                        <text
                          fg={selected() ? props.theme.brandShimmer : props.theme.text}
                          attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                        >
                          {`${selected() ? "›" : " "} ${decision.label}`}
                        </text>
                        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{decision.description}</text>
                      </box>
                    );
                  }}
                </For>
              </box>
              <text fg={props.theme.hintText} marginTop={1}>Press Enter to confirm or ESC to deny.</text>
            </>
          )}
        </Show>
      </box>
    </Show>
  );
}
