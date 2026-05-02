/**
 * Tool-approval overlay for the TUI.
 */

import { For, Show } from "solid-js";
import { RGBA, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
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

/** Icon glyph for each approval decision. */
function resolveDecisionIcon(decision: ToolApprovalDecision): string {
  switch (decision) {
    case "allow-once": return "✓";
    case "allow-always": return "✦";
    case "deny": return "✗";
  }
}

/** Foreground color for each approval decision. */
function resolveDecisionColor(decision: ToolApprovalDecision, theme: ThemeColors): string {
  switch (decision) {
    case "allow-once": return theme.success;
    case "allow-always": return theme.brand;
    case "deny": return theme.error;
  }
}

/**
 * Render the tool-approval overlay.
 */
export function ToolApprovalOverlay(props: ToolApprovalOverlayProps) {
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
        width={Math.min(terminal().width - 6, 72)}
        flexDirection="column"
        border
        borderColor={props.theme.warning}
        backgroundColor={props.theme.inverseText}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        {/* Header */}
        <box flexDirection="row" alignItems="center" gap={1} marginBottom={1}>
          <text fg={props.theme.warning} attributes={TextAttributes.BOLD}>⚠</text>
          <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Tool Approval Required</text>
        </box>

        <Show when={props.request}>
          {(request: () => ActiveApprovalRequest) => (
            <>
              {/* Tool info section */}
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
                <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
                  {props.formatTitle(request())}
                </text>
                <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                  {props.formatDescription(request())}
                </text>
              </box>

              {/* Color-coded decision options */}
              <For each={props.decisions}>
                {(decision, index) => {
                  const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                    request().selectedIndex,
                    props.decisions.length
                  );
                  const decisionColor = () => selected()
                    ? resolveDecisionColor(decision.decision, props.theme)
                    : props.theme.inactive;

                  return (
                    <box flexDirection="row" gap={1} paddingLeft={1} marginBottom={1}>
                      <text fg={decisionColor()} attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}>
                        {`${selected() ? "›" : " "} ${resolveDecisionIcon(decision.decision)}`}
                      </text>
                      <box flexDirection="column">
                        <text
                          fg={decisionColor()}
                          attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                        >
                          {decision.label}
                        </text>
                        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                          {decision.description}
                        </text>
                      </box>
                    </box>
                  );
                }}
              </For>

              {/* Footer hint */}
              <text fg={props.theme.hintText} attributes={TextAttributes.DIM} marginTop={1}>
                ↑↓ navigate  ·  Enter confirm  ·  ESC deny
              </text>
            </>
          )}
        </Show>
      </box>
      </box>
    </Show>
  );
}
