/**
 * Tests for transcript entry helpers.
 */

import { describe, expect, it } from "bun:test";
import type { ConversationMessage } from "../transcript/message.ts";
import {
  createEntry,
  formatToolCallEntry,
  rehydrateEntriesFromTranscript,
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
