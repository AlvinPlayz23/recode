/**
 * Tool approval policy helpers.
 */

import type { ToolArguments, ToolApprovalRequest, ToolApprovalScope, ToolExecutionContext } from "./tool.ts";

/**
 * Return an approval denial message when a tool cannot run yet.
 */
export async function checkToolApproval(
  toolName: string,
  arguments_: ToolArguments,
  context: ToolExecutionContext
): Promise<string | undefined> {
  const approvalMode = context.approvalMode ?? "approval";
  const scope = getToolApprovalScope(toolName);
  if (!requiresApproval(approvalMode, scope, context.approvalAllowlist ?? [])) {
    return undefined;
  }

  if (context.requestToolApproval === undefined) {
    return `Approval required for ${toolName}, but no interactive approval handler is available.`;
  }

  const request: ToolApprovalRequest = {
    toolName,
    scope,
    arguments: arguments_
  };

  const decision = await context.requestToolApproval(request);
  return decision === "deny" ? "Tool execution denied by user." : undefined;
}

/**
 * Map one tool name into its approval scope.
 */
export function getToolApprovalScope(toolName: string): ToolApprovalScope {
  switch (toolName) {
    case "AskUserQuestion":
      return "read";
    case "Read":
    case "Glob":
    case "Grep":
      return "read";
    case "Write":
    case "Edit":
      return "edit";
    case "Bash":
      return "bash";
    default:
      return "edit";
  }
}

/**
 * Determine whether one approval scope needs explicit approval.
 */
export function requiresApproval(
  approvalMode: ToolExecutionContext["approvalMode"],
  scope: ToolApprovalScope,
  allowlist: readonly ToolApprovalScope[]
): boolean {
  if (allowlist.includes(scope)) {
    return false;
  }

  switch (approvalMode) {
    case "yolo":
      return false;
    case "auto-edits":
      return scope === "bash";
    case "approval":
    default:
      return scope === "edit" || scope === "bash";
  }
}
