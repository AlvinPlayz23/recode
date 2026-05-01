/**
 * Tests for conversation compaction helpers.
 *
 * @author dev
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AiResponseStream } from "../ai/types.ts";
import type { ConversationMessage } from "../transcript/message.ts";

type StreamPart =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: Record<string, string> }
  | { type: "error"; error: unknown }
  | { type: "abort" }
  | { type: "finish-step"; info?: { finishReason?: string } }
  | { type: "finish" };

const fakeStreamAssistantResponse = mock<(options: Record<string, unknown>) => AiResponseStream>();

mock.module("../ai/stream-assistant-response.ts", () => ({
  streamAssistantResponse: fakeStreamAssistantResponse
}));

const {
  DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS,
  assertConversationFitsContextWindow,
  calculateReservedContextTokens,
  compactConversation,
  estimateConversationContextTokens,
  evaluateAutoCompaction,
  splitTranscriptForCompaction
} = await import("./compact-conversation.ts");

async function* yieldParts(parts: StreamPart[]): AsyncGenerator<StreamPart> {
  for (const part of parts) {
    yield part;
  }
}

function makeStreamResult(parts: StreamPart[]): AiResponseStream {
  return { fullStream: yieldParts(parts) };
}

describe("compact conversation", () => {
  beforeEach(() => {
    fakeStreamAssistantResponse.mockClear();
  });

  it("keeps the last two user turns and replaces older history with one summary", async () => {
    const capturedRequests: Array<Record<string, unknown>> = [];
    fakeStreamAssistantResponse.mockImplementationOnce((options) => {
      capturedRequests.push(options);
      return makeStreamResult([
        { type: "text-delta", text: "Carry forward the earlier work." },
        { type: "finish-step" },
        { type: "finish" }
      ]);
    });

    const transcript: readonly ConversationMessage[] = [
      { role: "user", content: "first request" },
      { role: "assistant", content: "first reply", toolCalls: [] },
      { role: "user", content: "second request" },
      { role: "assistant", content: "second reply", toolCalls: [] },
      { role: "user", content: "third request" },
      { role: "assistant", content: "third reply", toolCalls: [] }
    ];

    const result = await compactConversation({
      transcript,
      languageModel: {
        provider: "openai",
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt-4.1",
        apiKey: "test",
        api: "openai-responses"
      }
    });

    expect(result.kind).toBe("compacted");
    if (result.kind !== "compacted") {
      return;
    }

    expect(result.summaryMessage).toEqual({
      role: "summary",
      kind: "continuation",
      content: "Carry forward the earlier work."
    });
    expect(result.transcript).toEqual([
      result.summaryMessage,
      { role: "user", content: "second request" },
      { role: "assistant", content: "second reply", toolCalls: [] },
      { role: "user", content: "third request" },
      { role: "assistant", content: "third reply", toolCalls: [] }
    ]);

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]?.tools).toEqual([]);
    expect((capturedRequests[0]?.messages as ConversationMessage[]).map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user"
    ]);
  });

  it("returns a no-op when there is nothing compactable yet", async () => {
    const result = await compactConversation({
      transcript: [
        { role: "user", content: "first request" },
        { role: "assistant", content: "first reply", toolCalls: [] },
        { role: "user", content: "second request" },
        { role: "assistant", content: "second reply", toolCalls: [] }
      ],
      languageModel: {
        provider: "openai",
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt-4.1",
        apiKey: "test",
        api: "openai-responses"
      }
    });

    expect(result).toEqual({
      kind: "noop",
      reason: "nothing-to-compact"
    });
  });

  it("surfaces summarization failures", async () => {
    fakeStreamAssistantResponse.mockImplementationOnce(() => makeStreamResult([
      { type: "error", error: new Error("boom") }
    ]));

    await expect(compactConversation({
      transcript: [
        { role: "user", content: "first request" },
        { role: "assistant", content: "first reply", toolCalls: [] },
        { role: "user", content: "second request" },
        { role: "assistant", content: "second reply", toolCalls: [] },
        { role: "user", content: "third request" }
      ],
      languageModel: {
        provider: "openai",
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt-4.1",
        apiKey: "test",
        api: "openai-responses"
      }
    })).rejects.toThrow("boom");
  });

  it("estimates context usage from the last provider-reported step when available", () => {
    const estimate = estimateConversationContextTokens(
      [
        { role: "user", content: "first request" },
        {
          role: "assistant",
          content: "first reply",
          toolCalls: [],
          stepStats: {
            finishReason: "stop",
            durationMs: 10,
            toolCallCount: 0,
            tokenUsage: {
              input: 100,
              output: 30,
              reasoning: 5,
              cacheRead: 20,
              cacheWrite: 0
            }
          }
        },
        { role: "user", content: "follow-up" }
      ],
      "next prompt"
    );

    expect(estimate.source).toBe("usage-based");
    expect(estimate.estimatedTokens).toBeGreaterThan(150);
  });

  it("falls back to rough estimation when no usage metadata exists", () => {
    const estimate = estimateConversationContextTokens([
      { role: "user", content: "first request" },
      { role: "assistant", content: "reply", toolCalls: [] }
    ]);

    expect(estimate.source).toBe("rough");
    expect(estimate.estimatedTokens).toBeGreaterThan(0);
  });

  it("uses the reserved-buffer threshold to decide when to compact", () => {
    expect(calculateReservedContextTokens(50_000)).toBe(20_000);
    expect(calculateReservedContextTokens(8_000)).toBe(8_000);

    const decision = evaluateAutoCompaction(
      { estimatedTokens: 180_000, source: "rough" },
      DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS,
      20_000
    );

    expect(decision.reservedTokens).toBe(20_000);
    expect(decision.usableContextTokens).toBe(180_000);
    expect(decision.shouldCompact).toBe(true);
  });

  it("throws when a compacted transcript still exceeds the usable context window", () => {
    expect(() => assertConversationFitsContextWindow(
      [
        { role: "user", content: "x".repeat(900_000) }
      ],
      "more",
      DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS,
      20_000
    )).toThrow("Even after compaction");
  });

  it("reuses earlier summaries as compaction input instead of stacking them", () => {
    const split = splitTranscriptForCompaction([
      { role: "summary", kind: "continuation", content: "Earlier work" },
      { role: "user", content: "first request" },
      { role: "assistant", content: "first reply", toolCalls: [] },
      { role: "user", content: "second request" },
      { role: "assistant", content: "second reply", toolCalls: [] },
      { role: "user", content: "third request" }
    ]);

    expect(split.existingSummaries).toHaveLength(1);
    expect(split.compactableMessages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(split.tailMessages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  });
});
