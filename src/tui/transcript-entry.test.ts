/**
 * Tests for transcript entry helpers.
 */

import { describe, expect, it } from "bun:test";
import type { ConversationMessage } from "../transcript/message.ts";
import {
  createEntry,
  createToolCallUiEntry,
  extractLatestTodosFromTranscript,
  formatToolCallEntry,
  rehydrateEntriesFromTranscript,
  replaceTaskToolCallEntryWithResult,
  renderVisibleEntries
} from "./transcript-entry-state.ts";

describe("transcript entry helpers", () => {
  it("formats tool calls with compact argument summaries", () => {
    expect(formatToolCallEntry({
      id: "call_1",
      name: "Bash",
      argumentsJson: "{\"command\":\"bun run check\"}"
    })).toBe("Bash · bun run check");
  });

  it("rehydrates user, assistant, tool call, and error messages", () => {
    const transcript: readonly ConversationMessage[] = [
      { role: "user", content: "what is this project" },
      {
        role: "assistant",
        content: "I will inspect it.",
        toolCalls: [
          {
            id: "call_1",
            name: "Bash",
            argumentsJson: "{\"command\":\"ls -la\"}"
          }
        ]
      },
      {
        role: "tool",
        toolCallId: "call_1",
        toolName: "Bash",
        content: "Tool execution failed: TimeoutError",
        isError: true
      }
    ];

    const entries = rehydrateEntriesFromTranscript(transcript);

    expect(entries.map((entry) => [entry.kind, entry.body])).toEqual([
      ["user", "what is this project"],
      ["assistant", "I will inspect it."],
      ["tool", "Bash · ls -la"],
      ["error", "Bash failed: Tool execution failed: TimeoutError"]
    ]);
  });

  it("shows a status row for compacted continuation summaries", () => {
    const entries = rehydrateEntriesFromTranscript([
      {
        role: "summary",
        kind: "continuation",
        content: "Earlier work was summarized."
      }
    ]);

    expect(entries.map((entry) => [entry.kind, entry.body])).toEqual([
      ["status", "Earlier conversation history was compacted into a continuation summary."],
      ["assistant", "## Continuation Summary\n\nEarlier work was summarized."]
    ]);
  });

  it("rehydrates TodoWrite tool calls as preview entries", () => {
    const entries = rehydrateEntriesFromTranscript([
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_1",
            name: "TodoWrite",
            argumentsJson: JSON.stringify({
              todos: [
                { content: "Inspect code", activeForm: "Inspecting code", status: "completed", priority: "medium" },
                { content: "Add tests", activeForm: "Adding tests", status: "in_progress", priority: "high" }
              ]
            })
          }
        ]
      }
    ]);

    expect(entries.map((entry) => [entry.kind, entry.body])).toEqual([
      ["tool-preview", "Todo · 1 active, 1 completed"]
    ]);
    expect(entries[0]?.metadata).toEqual({
      kind: "todo-list",
      todos: [
        { content: "Inspect code", activeForm: "Inspecting code", status: "completed", priority: "medium" },
        { content: "Add tests", activeForm: "Adding tests", status: "in_progress", priority: "high" }
      ]
    });
  });

  it("hides successful TodoWrite result rows because the call row owns the preview", () => {
    const entries = rehydrateEntriesFromTranscript([
      {
        role: "tool",
        toolCallId: "call_1",
        toolName: "TodoWrite",
        content: "Updated todo list",
        isError: false,
        metadata: {
          kind: "todo-list",
          todos: [
            { content: "Inspect code", activeForm: "Inspecting code", status: "completed", priority: "medium" },
            { content: "Add tests", activeForm: "Adding tests", status: "completed", priority: "high" }
          ]
        }
      }
    ]);

    expect(entries).toEqual([]);
  });

  it("hides completed-only TodoWrite call previews", () => {
    const entries = rehydrateEntriesFromTranscript([
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_1",
            name: "TodoWrite",
            argumentsJson: JSON.stringify({
              todos: [
                { content: "Inspect code", activeForm: "Inspecting code", status: "completed", priority: "medium" },
                { content: "Add tests", activeForm: "Adding tests", status: "completed", priority: "high" }
              ]
            })
          }
        ]
      }
    ]);

    expect(entries).toEqual([]);
  });

  it("renders Task call and result rows as compact summaries", () => {
    const callOnlyEntries = rehydrateEntriesFromTranscript([
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_task",
            name: "Task",
            argumentsJson: JSON.stringify({
              description: "Inspect routing",
              prompt: "Find routing code.",
              subagentType: "explore"
            })
          }
        ]
      }
    ]);

    expect(callOnlyEntries.map((entry) => [entry.kind, entry.body])).toEqual([
      ["tool-preview", "Task · running explore · Inspect routing"]
    ]);

    const completedEntries = rehydrateEntriesFromTranscript([
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_task",
            name: "Task",
            argumentsJson: JSON.stringify({
              description: "Inspect routing",
              prompt: "Find routing code.",
              subagentType: "explore"
            })
          }
        ]
      },
      {
        role: "tool",
        toolCallId: "call_task",
        toolName: "Task",
        content: "task_id: task_1",
        isError: false,
        metadata: {
          kind: "task-result",
          taskId: "task_1",
          subagentType: "explore",
          description: "Inspect routing",
          status: "completed",
          summary: "Routing lives in src/routes.ts.",
          resumed: false
        }
      }
    ]);

    expect(completedEntries.map((entry) => [entry.kind, entry.body])).toEqual([
      ["tool-preview", "Task · completed explore · Inspect routing"]
    ]);
  });

  it("replaces a live Task call row with the completed result row", () => {
    const taskCall = {
      id: "call_task",
      name: "Task",
      argumentsJson: JSON.stringify({
        description: "Inspect routing",
        prompt: "Find routing code.",
        subagentType: "explore"
      })
    };
    const runningEntry = createToolCallUiEntry(taskCall);
    expect(runningEntry?.body).toBe("Task · running explore · Inspect routing");

    const replacement = replaceTaskToolCallEntryWithResult(
      runningEntry === undefined ? [] : [runningEntry],
      {
        role: "tool",
        toolCallId: "call_task",
        toolName: "Task",
        content: "task_id: task_1",
        isError: false,
        metadata: {
          kind: "task-result",
          taskId: "task_1",
          subagentType: "explore",
          description: "Inspect routing",
          status: "completed",
          summary: "Routing lives in src/routes.ts.",
          resumed: false
        }
      }
    );

    expect(replacement.replaced).toBe(true);
    expect(replacement.entries).toHaveLength(1);
    expect(replacement.entries[0]?.id).toBe(runningEntry?.id);
    expect(replacement.entries[0]?.body).toBe("Task · completed explore · Inspect routing");
    expect(replacement.entries[0]?.metadata).toEqual({
      kind: "task-result",
      taskId: "task_1",
      subagentType: "explore",
      description: "Inspect routing",
      status: "completed",
      summary: "Routing lives in src/routes.ts.",
      resumed: false
    });
  });

  it("extracts the latest todo list from transcript metadata", () => {
    const transcript: readonly ConversationMessage[] = [
      {
        role: "tool",
        toolCallId: "call_1",
        toolName: "TodoWrite",
        content: "Updated todo list",
        isError: false,
        metadata: {
          kind: "todo-list",
          todos: [
            { content: "Old", activeForm: "Doing old", status: "completed", priority: "low" }
          ]
        }
      },
      {
        role: "tool",
        toolCallId: "call_2",
        toolName: "TodoWrite",
        content: "Updated todo list",
        isError: false,
        metadata: {
          kind: "todo-list",
          todos: [
            { content: "New", activeForm: "Doing new", status: "in_progress", priority: "high" }
          ]
        }
      }
    ];

    expect(extractLatestTodosFromTranscript(transcript)).toEqual([
      { content: "New", activeForm: "Doing new", status: "in_progress", priority: "high" }
    ]);
  });

  it("collapses consecutive tool entries without hiding non-tool entries", () => {
    const visibleEntries = renderVisibleEntries([
      createEntry("tool", "tool", "Read · README.md"),
      createEntry("tool", "tool", "Grep · TODO"),
      createEntry("assistant", "Recode", "done")
    ], true);

    expect(visibleEntries.map((entry) => [entry.kind, entry.body])).toEqual([
      ["tool-group", "2 tool calls (collapsed)"],
      ["assistant", "done"]
    ]);
  });
});
