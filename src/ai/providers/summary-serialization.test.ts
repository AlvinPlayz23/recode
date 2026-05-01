/**
 * Provider serialization tests for continuation summaries.
 *
 * @author dev
 */

import { afterEach, describe, expect, it } from "bun:test";
import type { ConversationMessage } from "../../transcript/message.ts";
import { streamAnthropicMessages } from "./anthropic.ts";
import { streamOpenAiChat } from "./openai-chat.ts";
import { streamOpenAiResponses } from "./openai-responses.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("continuation summary serialization", () => {
  it("serializes summary messages for OpenAI Chat", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    }) as typeof fetch;

    await consumeStream(streamOpenAiChat(
      {
        provider: "openai-chat",
        providerId: "openai-chat",
        providerName: "OpenAI Chat",
        modelId: "gpt-4.1-mini",
        apiKey: "test",
        baseUrl: "https://example.com/v1",
        api: "openai-chat-completions"
      },
      "system",
      [buildSummaryMessage("Keep the file edits and pending bugfix in mind.")],
      []
    ));

    expect(requestBody?.messages).toEqual([
      { role: "system", content: "system" },
      {
        role: "user",
        content: "System-generated continuation summary:\nKeep the file edits and pending bugfix in mind."
      }
    ]);
  });

  it("serializes summary messages for OpenAI Responses", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    }) as typeof fetch;

    await consumeStream(streamOpenAiResponses(
      {
        provider: "openai",
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt-4.1",
        apiKey: "test",
        baseUrl: "https://example.com/v1",
        api: "openai-responses"
      },
      "",
      [buildSummaryMessage("Remember the architecture decisions.")],
      []
    ));

    expect(requestBody?.input).toEqual([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "System-generated continuation summary:\nRemember the architecture decisions."
          }
        ]
      }
    ]);
  });

  it("serializes summary messages for Anthropic", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    }) as typeof fetch;

    await consumeStream(streamAnthropicMessages(
      {
        provider: "anthropic",
        providerId: "anthropic",
        providerName: "Anthropic",
        modelId: "claude-sonnet",
        apiKey: "test",
        baseUrl: "https://example.com/v1",
        api: "anthropic-messages"
      },
      "",
      [buildSummaryMessage("Carry over the unresolved parser issue.")],
      []
    ));

    expect(requestBody?.messages).toEqual([
      {
        role: "user",
        content: "System-generated continuation summary:\nCarry over the unresolved parser issue."
      }
    ]);
  });
});

function buildSummaryMessage(content: string): ConversationMessage {
  return {
    role: "summary",
    kind: "continuation",
    content
  };
}

async function consumeStream(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _part of stream) {
    // Intentionally empty: we only need the request body.
  }
}
