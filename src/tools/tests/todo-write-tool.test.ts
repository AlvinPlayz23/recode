/**
 * Tests for the TodoWrite tool.
 */

import { describe, expect, it } from "bun:test";
import { ToolExecutionError } from "../../errors/recode-error.ts";
import { createTodoWriteTool, parseTodoWriteInput } from "../todo-write-tool.ts";

describe("TodoWrite tool", () => {
  it("rejects malformed todo lists", () => {
    expect(() => parseTodoWriteInput({})).toThrow(ToolExecutionError);
    expect(() => parseTodoWriteInput({ todos: [{ content: "", status: "pending", priority: "high" }] })).toThrow(ToolExecutionError);
    expect(() => parseTodoWriteInput({ todos: [{ content: "Do it", status: "started", priority: "high" }] })).toThrow(ToolExecutionError);
    expect(() => parseTodoWriteInput({ todos: [{ content: "Do it", status: "pending", priority: "urgent" }] })).toThrow(ToolExecutionError);
  });

  it("returns normalized todos as result metadata", async () => {
    const tool = createTodoWriteTool();
    const result = await tool.execute(
      {
        todos: [
          { content: "  Inspect   files  ", status: "completed", priority: "medium" },
          { content: "Add tests", status: "in_progress", priority: "high" }
        ]
      },
      { workspaceRoot: "/workspace" }
    );

    expect(result.isError).toBe(false);
    expect(result.content).toContain("Updated todo list:");
    expect(result.metadata).toEqual({
      kind: "todo-list",
      todos: [
        { content: "Inspect files", status: "completed", priority: "medium" },
        { content: "Add tests", status: "in_progress", priority: "high" }
      ]
    });
  });
});
