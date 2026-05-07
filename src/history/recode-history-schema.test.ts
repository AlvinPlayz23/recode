/**
 * Direct tests for persisted history JSON schema parsing.
 */

import { describe, expect, it } from "bun:test";
import {
  conversationToMeta,
  createEmptyHistoryIndex,
  parseConversationRecord,
  parseHistoryIndex
} from "./recode-history-schema.ts";
import type { SavedConversationRecord } from "./recode-history-types.ts";

describe("recode history schema", () => {
  it("returns an empty index for non-object input", () => {
    expect(parseHistoryIndex("nope")).toEqual(createEmptyHistoryIndex());
  });

  it("parses step stats with token usage", () => {
    const record = parseConversationRecord({
      ...baseConversationMeta(),
      transcript: [
        {
          role: "assistant",
          content: "Done.",
          toolCalls: [],
          stepStats: {
            finishReason: "stop",
            durationMs: 12.8,
            toolCallCount: 0,
            costUsd: 0.01,
            tokenUsage: {
              input: 10,
              output: 20,
              reasoning: 3,
              cacheRead: 4,
              cacheWrite: 5
            }
          }
        }
      ]
    });

    expect(record?.transcript[0]).toEqual({
      role: "assistant",
      content: "Done.",
      toolCalls: [],
      stepStats: {
        finishReason: "stop",
        durationMs: 12,
        toolCallCount: 0,
        costUsd: 0.01,
        tokenUsage: {
          input: 10,
          output: 20,
          reasoning: 3,
          cacheRead: 4,
          cacheWrite: 5
        }
      }
    });
  });

  it("drops invalid token usage while keeping valid step stats", () => {
    const record = parseConversationRecord({
      ...baseConversationMeta(),
      transcript: [
        {
          role: "assistant",
          content: "Done.",
          toolCalls: [],
          stepStats: {
            finishReason: "tool_calls",
            durationMs: 20,
            toolCallCount: 1,
            tokenUsage: {
              input: 10,
              output: "bad",
              reasoning: 0,
              cacheRead: 0,
              cacheWrite: 0
            }
          }
        }
      ]
    });

    expect(record?.transcript[0]).toEqual({
      role: "assistant",
      content: "Done.",
      toolCalls: [],
      stepStats: {
        finishReason: "tool_calls",
        durationMs: 20,
        toolCallCount: 1
      }
    });
  });

  it("preserves provider-specific tool call extra content", () => {
    const record = parseConversationRecord({
      ...baseConversationMeta(),
      transcript: [
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call_1",
              name: "Bash",
              argumentsJson: "{\"command\":\"echo hi\"}",
              extraContent: {
                google: {
                  thought_signature: "sig_123"
                }
              }
            }
          ]
        }
      ]
    });

    expect(record?.transcript[0]).toEqual({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "call_1",
          name: "Bash",
          argumentsJson: "{\"command\":\"echo hi\"}",
          extraContent: {
            google: {
              thought_signature: "sig_123"
            }
          }
        }
      ]
    });
  });

  it("parses edit-preview tool result metadata", () => {
    const record = parseConversationRecord({
      ...baseConversationMeta(),
      transcript: [
        {
          role: "tool",
          toolCallId: "call_1",
          toolName: "Edit",
          content: "Edited file: src/index.ts",
          isError: false,
          metadata: {
            kind: "edit-preview",
            path: "src/index.ts",
            oldText: "old",
            newText: "new"
          }
        }
      ]
    });

    expect(record?.transcript[0]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "Edit",
      content: "Edited file: src/index.ts",
      isError: false,
      metadata: {
        kind: "edit-preview",
        path: "src/index.ts",
        oldText: "old",
        newText: "new"
      }
    });
  });

  it("parses todo-list tool result metadata", () => {
    const record = parseConversationRecord({
      ...baseConversationMeta(),
      transcript: [
        {
          role: "tool",
          toolCallId: "call_1",
          toolName: "TodoWrite",
          content: "Updated todo list",
          isError: false,
          metadata: {
            kind: "todo-list",
            todos: [
              { content: "Inspect code", status: "completed", priority: "medium" },
              { content: "Add tests", status: "in_progress", priority: "high" },
              { content: "", status: "pending", priority: "low" },
              { content: "Bad status", status: "started", priority: "low" }
            ]
          }
        }
      ]
    });

    expect(record?.transcript[0]).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "TodoWrite",
      content: "Updated todo list",
      isError: false,
      metadata: {
        kind: "todo-list",
        todos: [
          { content: "Inspect code", status: "completed", priority: "medium" },
          { content: "Add tests", status: "in_progress", priority: "high" }
        ]
      }
    });
  });

  it("keeps continuation summaries and rejects malformed summary messages", () => {
    const record = parseConversationRecord({
      ...baseConversationMeta(),
      transcript: [
        { role: "summary", kind: "continuation", content: "Earlier context." },
        { role: "summary", kind: "other", content: "Skip me." }
      ]
    });

    expect(record?.transcript).toEqual([
      { role: "summary", kind: "continuation", content: "Earlier context." }
    ]);
  });

  it("converts conversation records to index metadata", () => {
    const record: SavedConversationRecord = {
      ...baseConversationMeta(),
      transcript: [{ role: "user", content: "hi" }]
    };

    expect(conversationToMeta(record)).toEqual(baseConversationMeta());
  });
});

function baseConversationMeta(): Omit<SavedConversationRecord, "transcript"> {
  return {
    id: "conversation-1",
    title: "Title",
    preview: "Preview",
    workspaceRoot: "/workspace",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    providerId: "openai",
    providerName: "OpenAI",
    model: "gpt-4.1",
    mode: "build",
    messageCount: 1
  };
}
