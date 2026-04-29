/**
 * Tests for persistent Recode history helpers.
 *
 * @author dev
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { ConversationMessage } from "../messages/message.ts";
import {
  buildConversationMeta,
  createConversationRecord,
  loadConversation,
  loadHistoryIndex,
  resolveHistoryRoot,
  saveConversation
} from "./recode-history.ts";

describe("recode history", () => {
  it("resolves the history root next to the config file", () => {
    expect(resolveHistoryRoot("/home/user/.recode/config.json")).toBe(resolve("/home/user/.recode/history"));
  });

  it("saves conversations and marks the active one", () => {
    const historyRoot = mkdtempSync(join(tmpdir(), "recode-history-"));
    const transcript: readonly ConversationMessage[] = [
      { role: "user", content: "Explain the architecture" },
      {
        role: "assistant",
        content: "Here is the architecture.",
        toolCalls: []
      },
      {
        role: "tool",
        toolCallId: "call_1",
        toolName: "Edit",
        content: "Edited file: src/index.ts",
        isError: false,
        metadata: {
          kind: "edit-preview",
          path: "src/index.ts",
          oldText: "old line",
          newText: "new line"
        }
      }
    ];

    const conversation = createConversationRecord(
      { providerId: "openai", providerName: "OpenAI", model: "gpt-4.1" },
      transcript,
      "build",
      { id: "conversation-1", createdAt: "2026-01-01T00:00:00.000Z" }
    );

    const index = saveConversation(historyRoot, conversation, true);
    const loadedConversation = loadConversation(historyRoot, conversation.id);

    expect(index.lastConversationId).toBe("conversation-1");
    expect(index.conversations[0]?.title).toBe("Explain the architecture");
    expect(loadedConversation).toEqual(conversation);
  });

  it("returns an empty index when the history root does not exist", () => {
    const historyRoot = join(tmpdir(), "definitely-missing-recode-history-root");
    expect(loadHistoryIndex(historyRoot)).toEqual({
      version: 1,
      conversations: []
    });
  });

  it("builds conversation metadata from the transcript", () => {
    const meta = buildConversationMeta(
      { providerId: "openai", providerName: "OpenAI", model: "gpt-4.1" },
      [
        { role: "user", content: "Implement the setup wizard", },
        { role: "assistant", content: "Implemented.", toolCalls: [] }
      ],
      "plan",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:05:00.000Z",
      "conversation-2"
    );

    expect(meta).toEqual({
      id: "conversation-2",
      title: "Implement the setup wizard",
      preview: "Implemented.",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
      providerId: "openai",
      providerName: "OpenAI",
      model: "gpt-4.1",
      mode: "plan",
      messageCount: 2
    });
  });
});
