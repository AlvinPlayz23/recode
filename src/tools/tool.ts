/**
 * Core type definitions for the tool system.
 *
 * @author dev
 */

/**
 * JSON Schema string definition.
 */
export interface JsonSchemaString {
  readonly type: "string";
  readonly description?: string;
}

/**
 * JSON Schema number definition.
 */
export interface JsonSchemaNumber {
  readonly type: "number";
  readonly description?: string;
}

/**
 * JSON Schema boolean definition.
 */
export interface JsonSchemaBoolean {
  readonly type: "boolean";
  readonly description?: string;
}

/**
 * Object schema for tool input.
 */
export interface JsonSchemaObject {
  readonly type: "object";
  readonly description?: string;
  readonly properties: Readonly<Record<string, JsonSchema>>;
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
}

/**
 * Array schema for tool input.
 */
export interface JsonSchemaArray {
  readonly type: "array";
  readonly description?: string;
  readonly items: JsonSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
}

/** Recursive JSON schema node supported by tool definitions. */
export type JsonSchema = JsonSchemaString | JsonSchemaNumber | JsonSchemaBoolean | JsonSchemaObject | JsonSchemaArray;

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

/** One selectable option in a user question. */
export interface QuestionOption {
  readonly label: string;
  readonly description: string;
}

/** One question prompt presented to the user. */
export interface QuestionPrompt {
  readonly id: string;
  readonly header: string;
  readonly question: string;
  readonly multiSelect: boolean;
  readonly allowCustomText: boolean;
  readonly options: readonly QuestionOption[];
}

/** Request payload for the AskUserQuestion tool. */
export interface QuestionToolRequest {
  readonly questions: readonly QuestionPrompt[];
}

/** One normalized answer returned from the question prompt. */
export interface QuestionAnswer {
  readonly questionId: string;
  readonly selectedOptionLabels: readonly string[];
  readonly customText: string;
}

/** Decision result for the AskUserQuestion tool. */
export type QuestionToolDecision =
  | { readonly dismissed: true }
  | { readonly dismissed: false; readonly answers: readonly QuestionAnswer[] };

/** Async question handler for interactive sessions. */
export interface QuestionRequestHandler {
  (request: QuestionToolRequest): Promise<QuestionToolDecision>;
}

/**
 * Tool execution context.
 */
export interface ToolExecutionContext {
  readonly workspaceRoot: string;
  readonly approvalMode?: ApprovalMode;
  readonly approvalAllowlist?: readonly ToolApprovalScope[];
  readonly abortSignal?: AbortSignal;
  readonly requestToolApproval?: ToolApprovalHandler;
  readonly requestQuestionAnswers?: QuestionRequestHandler;
}

/** Structured preview for one successful Edit tool replacement. */
export interface EditToolResultMetadata {
  readonly kind: "edit-preview";
  readonly path: string;
  readonly oldText: string;
  readonly newText: string;
}

/** Structured metadata attached to a tool result. */
export type ToolResultMetadata = EditToolResultMetadata;

/**
 * Tool execution result.
 */
export interface ToolResult {
  readonly content: string;
  readonly isError: boolean;
  readonly metadata?: ToolResultMetadata;
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
