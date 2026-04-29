/**
 * Tool call executor.
 *
 * @author dev
 */

import { ToolExecutionError } from "../errors/recode-error.ts";
import type { ToolCall, ToolResultMessage } from "../messages/message.ts";
import { isRecord } from "../shared/is-record.ts";
import type { ToolArguments, ToolApprovalRequest, ToolApprovalScope, ToolExecutionContext } from "./tool.ts";
import { ToolRegistry } from "./tool-registry.ts";

/**
 * Execute one tool call and return the corresponding tool result message.
 */
export async function executeToolCall(
  toolCall: ToolCall,
  registry: ToolRegistry,
  context: ToolExecutionContext
): Promise<ToolResultMessage> {
  const tool = registry.get(toolCall.name);

  if (tool === undefined) {
    return createErrorResult(toolCall, `Unknown tool: ${toolCall.name}`);
  }

  try {
    const parsedArguments = parseToolArguments(toolCall.argumentsJson);
    const approvalResult = await checkToolApproval(toolCall.name, parsedArguments, context);
    if (approvalResult !== undefined) {
      return createErrorResult(toolCall, approvalResult);
    }
    const result = await tool.execute(parsedArguments, context);

    return {
      role: "tool",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: result.content,
      isError: result.isError,
      ...(result.metadata === undefined ? {} : { metadata: result.metadata })
    };
  } catch (error) {
    return createErrorResult(toolCall, errorToMessage(error));
  }
}

async function checkToolApproval(
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

function getToolApprovalScope(toolName: string): ToolApprovalScope {
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

function requiresApproval(
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

function parseToolArguments(argumentsJson: string): ToolArguments {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(argumentsJson);
  } catch (error) {
    throw new ToolExecutionError("Tool arguments must be valid JSON.", { cause: error });
  }

  if (!isRecord(parsedValue)) {
    throw new ToolExecutionError("Tool arguments must decode to a JSON object.");
  }

  return parsedValue;
}

function createErrorResult(toolCall: ToolCall, message: string): ToolResultMessage {
  return {
    role: "tool",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: `Tool execution failed: ${message}`,
    isError: true
  };
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
