/**
 * Provider stream fixture tests.
 */

import { afterEach, describe, expect, it } from "bun:test";
import type { AiModel, AiStreamPart } from "../types.ts";
import { streamAnthropicMessages } from "./anthropic.ts";
import { streamOpenAiChat } from "./openai-chat.ts";
import { streamOpenAiResponses } from "./openai-responses.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("provider stream fixtures", () => {
  it("parses OpenAI Responses text, tool calls, and finish usage", async () => {
    stubSseFetch([
      sse({ type: "response.output_text.delta", delta: "Hello" }),
      sse({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "item_1",
          call_id: "call_1",
          name: "Read",
          arguments: "{\"path\":\"README.md\"}"
        }
      }),
      sse({
        type: "response.completed",
        response: {
          status: "completed",
          usage: {
            input_tokens: 11,
            output_tokens: 7,
            reasoning_tokens: 2,
            input_tokens_details: { cached_tokens: 3 }
          }
        }
      })
    ]);

    const parts = await collectParts(streamOpenAiResponses(
      openAiResponsesModel(),
      "",
      [],
      []
    ));

    expect(parts).toEqual([
      { type: "text-delta", text: "Hello" },
      {
        type: "tool-call",
        toolCallId: "call_1|item_1",
        toolName: "Read",
        input: { path: "README.md" }
      },
      {
        type: "finish-step",
        info: {
          finishReason: "completed",
          tokenUsage: {
            input: 11,
            output: 7,
            reasoning: 2,
            cacheRead: 3,
            cacheWrite: 0
          }
        }
      },
      { type: "finish" }
    ]);
  });

  it("parses OpenAI Chat streamed content and accumulated tool arguments", async () => {
    stubSseFetch([
      sse({
        choices: [
          {
            delta: { content: "Hello" },
            finish_reason: null
          }
        ]
      }),
      sse({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: {
                    name: "Read",
                    arguments: "{\"path\""
                  }
                }
              ]
            },
            finish_reason: null
          }
        ]
      }),
      sse({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: ":\"README.md\"}"
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ]
      }),
      "data: [DONE]\n\n"
    ]);

    const parts = await collectParts(streamOpenAiChat(
      openAiChatModel(),
      "",
      [],
      []
    ));

    expect(parts).toEqual([
      { type: "text-delta", text: "Hello" },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "Read",
        input: { path: "README.md" }
      },
      {
        type: "finish-step",
        info: { finishReason: "tool_calls" }
      },
      { type: "finish" }
    ]);
  });

  it("adds OpenRouter low-latency routing and prompt cache affinity", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    }) as typeof fetch;

    await collectParts(streamOpenAiChat(
      {
        ...openAiChatModel(),
        providerId: "openrouter",
        providerName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1"
      },
      "",
      [],
      [],
      undefined,
      "conversation-1"
    ));

    expect(requestBody?.usage).toEqual({ include: true });
    expect(requestBody?.provider).toEqual({ sort: "latency" });
    expect(requestBody?.prompt_cache_key).toBe("conversation-1");
  });

  it("parses Anthropic text, tool use blocks, and usage", async () => {
    stubSseFetch([
      sse({
        type: "message_start",
        message: {
          usage: {
            input_tokens: 5,
            cache_read_input_tokens: 2,
            cache_creation_input_tokens: 1
          }
        }
      }),
      sse({
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: "Hello"
        }
      }),
      sse({
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "tool_use",
          id: "toolu_1",
          name: "Read",
          input: { path: "README.md" }
        }
      }),
      sse({
        type: "content_block_stop",
        index: 1
      }),
      sse({
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 9 }
      })
    ]);

    const parts = await collectParts(streamAnthropicMessages(
      anthropicModel(),
      "",
      [],
      []
    ));

    expect(parts).toEqual([
      { type: "text-delta", text: "Hello" },
      {
        type: "tool-call",
        toolCallId: "toolu_1",
        toolName: "Read",
        input: { path: "README.md" }
      },
      {
        type: "finish-step",
        info: {
          finishReason: "tool_use",
          tokenUsage: {
            input: 5,
            output: 9,
            reasoning: 0,
            cacheRead: 2,
            cacheWrite: 1
          }
        }
      },
      { type: "finish" }
    ]);
  });
});

function stubSseFetch(events: readonly string[]): void {
  globalThis.fetch = (async () => new Response(events.join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  })) as unknown as typeof fetch;
}

function sse(value: Record<string, unknown>): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

async function collectParts(stream: AsyncIterable<AiStreamPart>): Promise<readonly AiStreamPart[]> {
  const parts: AiStreamPart[] = [];

  for await (const part of stream) {
    parts.push(part);
  }

  return parts;
}

function openAiResponsesModel(): AiModel {
  return {
    provider: "openai",
    providerId: "openai",
    providerName: "OpenAI",
    modelId: "gpt-4.1",
    apiKey: "test",
    baseUrl: "https://example.com/v1",
    api: "openai-responses"
  };
}

function openAiChatModel(): AiModel {
  return {
    provider: "openai-chat",
    providerId: "openai-chat",
    providerName: "OpenAI Chat",
    modelId: "gpt-4.1",
    apiKey: "test",
    baseUrl: "https://example.com/v1",
    api: "openai-chat-completions"
  };
}

function anthropicModel(): AiModel {
  return {
    provider: "anthropic",
    providerId: "anthropic",
    providerName: "Anthropic",
    modelId: "claude-sonnet",
    apiKey: "test",
    baseUrl: "https://example.com/v1",
    api: "anthropic-messages"
  };
}
