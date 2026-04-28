/**
 * Tests for tool-call approval handling.
 *
 * @author dev
 */

import { describe, expect, it } from "bun:test";
import type { ToolCall } from "../messages/message.ts";
import { executeToolCall } from "./execute-tool-call.ts";
import { ToolRegistry } from "./tool-registry.ts";
import type { ToolDefinition } from "./tool.ts";

const EDIT_TOOL: ToolDefinition = {
  name: "Edit",
  description: "Edit a file.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false
  },
  async execute() {
    return {
      content: "edited",
      isError: false
    };
  }
};

const READ_TOOL: ToolDefinition = {
  name: "Read",
  description: "Read a file.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false
  },
  async execute() {
    return {
      content: "read",
      isError: false
    };
  }
};

describe("executeToolCall approval handling", () => {
  it("blocks tools that require approval when no interactive handler exists", async () => {
    const result = await executeToolCall(
      createToolCall("Edit"),
      new ToolRegistry([EDIT_TOOL]),
      {
        workspaceRoot: "/workspace",
        approvalMode: "approval"
      }
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Approval required for Edit");
  });

  it("allows auto-edits mode to run edit tools without prompting", async () => {
    const result = await executeToolCall(
      createToolCall("Edit"),
      new ToolRegistry([EDIT_TOOL]),
      {
        workspaceRoot: "/workspace",
        approvalMode: "auto-edits"
      }
    );

    expect(result).toEqual({
      role: "tool",
      toolCallId: "tool-call-1",
      toolName: "Edit",
      content: "edited",
      isError: false
    });
  });

  it("respects a deny decision from the approval handler", async () => {
    const result = await executeToolCall(
      createToolCall("Bash"),
      new ToolRegistry([{
        ...EDIT_TOOL,
        name: "Bash"
      }]),
      {
        workspaceRoot: "/workspace",
        approvalMode: "approval",
        requestToolApproval: async () => "deny"
      }
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("denied by user");
  });

  it("skips approval for allowlisted scopes", async () => {
    const result = await executeToolCall(
      createToolCall("Read"),
      new ToolRegistry([READ_TOOL]),
      {
        workspaceRoot: "/workspace",
        approvalMode: "approval",
        approvalAllowlist: ["read"]
      }
    );

    expect(result.isError).toBe(false);
    expect(result.content).toBe("read");
  });
});

function createToolCall(name: string): ToolCall {
  return {
    id: "tool-call-1",
    name,
    argumentsJson: "{}"
  };
}
