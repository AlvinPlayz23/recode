/**
 * Core type definitions for the tool system.
 *
 * @author dev
 */

/**
 * JSON Schema property definition.
 */
export interface JsonSchemaProperty {
  readonly type: "string" | "number" | "boolean";
  readonly description: string;
}

/**
 * Object schema for tool input.
 */
export interface JsonSchemaObject {
  readonly type: "object";
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
}

/**
 * Raw tool argument object.
 */
export interface ToolArguments {
  readonly [key: string]: unknown;
}

/** Approval mode for tool execution. */
export type ApprovalMode = "approval" | "auto-edits" | "yolo";

/** Tool approval scope bucket. */
export type ToolApprovalScope = "read" | "edit" | "bash";

/** User decision for a tool approval prompt. */
export type ToolApprovalDecision = "allow-once" | "allow-always" | "deny";

/** Metadata for one tool approval request. */
export interface ToolApprovalRequest {
  readonly toolName: string;
  readonly scope: ToolApprovalScope;
  readonly arguments: ToolArguments;
}

/** Async approval handler for interactive sessions. */
export interface ToolApprovalHandler {
  (request: ToolApprovalRequest): Promise<ToolApprovalDecision>;
}

/**
 * Tool execution context.
 */
export interface ToolExecutionContext {
  readonly workspaceRoot: string;
  readonly approvalMode?: ApprovalMode;
  readonly approvalAllowlist?: readonly ToolApprovalScope[];
  readonly requestToolApproval?: ToolApprovalHandler;
}

/**
 * Tool execution result.
 */
export interface ToolResult {
  readonly content: string;
  readonly isError: boolean;
}

/**
 * Definition for a single tool.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchemaObject;
  execute(arguments_: ToolArguments, context: ToolExecutionContext): Promise<ToolResult>;
}
