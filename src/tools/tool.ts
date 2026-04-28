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

/**
 * Tool execution context.
 */
export interface ToolExecutionContext {
  readonly workspaceRoot: string;
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
