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
            output_tokens_details: { reasoning_tokens: 2 },
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

  it("parses OpenAI-compatible tool calls when provider omits streamed tool indexes", async () => {
    stubSseFetch([
      sse({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: "call_1",
                  extra_content: {
                    google: {
                      thought_signature: "sig_123"
                    }
                  },
                  function: {
                    name: "Write",
                    arguments: "{\"path\":\"index.html\""
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
                  function: {
                    arguments: ",\"content\":\"<html></html>\"}"
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
      {
        ...openAiChatModel(),
        provider: "gemini",
        providerId: "gemini",
        providerName: "Google AI Studio",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai"
      },
      "",
      [],
      []
    ));

    expect(parts).toEqual([
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "Write",
        input: {
          path: "index.html",
          content: "<html></html>"
        },
        extraContent: {
          google: {
            thought_signature: "sig_123"
          }
        }
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

  it("uses OpenAI Chat max_completion_tokens and SDK request controls by default", async () => {
    let requestBody: Record<string, unknown> | undefined;
    let requestInit: RequestInit | undefined;
    const abortController = new AbortController();
    globalThis.fetch = (async (_input, init) => {
      requestInit = init;
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    }) as typeof fetch;

    await collectParts(streamOpenAiChat(
      {
        ...openAiChatModel(),
        baseUrl: "https://api.openai.com/v1",
        modelId: "gpt-5-mini",
        maxOutputTokens: 1234,
        providerOptions: {
          timeoutMs: 4321,
          maxRetries: 1
        }
      },
      "",
      [],
      [],
      abortController.signal
    ));

    expect(requestBody?.max_completion_tokens).toBe(1234);
    expect(requestBody?.max_tokens).toBeUndefined();
    expect(requestBody?.store).toBe(false);
    expect(requestBody?.stream_options).toEqual({ include_usage: true });
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
    expect(requestInit?.signal?.aborted).toBe(false);
  });

  it("lets OpenAI Chat compat override max token field and tool result shape", async () => {
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
        maxOutputTokens: 99,
        providerOptions: {
          compat: {
            maxTokensField: "max_tokens",
            requiresToolResultName: true,
            requiresAssistantAfterToolResult: true,
            supportsUsageInStreaming: false,
            supportsStore: false
          }
        }
      },
      "",
      [
        {
          role: "tool",
          toolCallId: "call_1",
          toolName: "Read",
          content: "ok",
          isError: false
        },
        {
          role: "user",
          content: "continue"
        }
      ],
      []
    ));

    expect(requestBody?.max_tokens).toBe(99);
    expect(requestBody?.max_completion_tokens).toBeUndefined();
    expect(requestBody?.stream_options).toBeUndefined();
    expect(requestBody?.store).toBeUndefined();
    expect(requestBody?.compat).toBeUndefined();
    expect(requestBody?.messages).toEqual([
      {
        role: "tool",
        tool_call_id: "call_1",
        content: "ok",
        name: "Read"
      },
      {
        role: "assistant",
        content: "I have processed the tool results."
      },
      {
        role: "user",
        content: "continue"
      }
    ]);
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

  it("parses Anthropic streamed tool arguments instead of concatenating initial input", async () => {
    stubSseFetch([
      sse({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu/bad+id=",
          name: "Write",
          input: { stale: true }
        }
      }),
      sse({
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: "{\"path\":\"index.html\""
        }
      }),
      sse({
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: ",\"content\":\"hi\"}"
        }
      }),
      sse({
        type: "content_block_stop",
        index: 0
      })
    ]);

    const parts = await collectParts(streamAnthropicMessages(
      anthropicModel(),
      "",
      [],
      []
    ));

    expect(parts).toEqual([
      {
        type: "tool-call",
        toolCallId: "toolu_bad_id_",
        toolName: "Write",
        input: {
          path: "index.html",
          content: "hi"
        }
      },
      { type: "finish-step", info: {} },
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
