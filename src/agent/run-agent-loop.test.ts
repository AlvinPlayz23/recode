/**
 * Main agent loop tests.
 *
 * @author Zhenxin
 */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import type { ConversationMessage } from "../messages/message.ts";
import type { AiResponseStream } from "../ai/types.ts";
import type { ToolArguments, ToolDefinition, ToolExecutionContext, ToolResult } from "../tools/tool.ts";
import { ToolRegistry } from "../tools/tool-registry.ts";

type StreamPart =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: Record<string, string> }
  | { type: "error"; error: unknown }
  | { type: "abort" }
  | { type: "finish-step" }
  | { type: "finish" };

const fakeStreamAssistantResponse = mock<(options: Record<string, unknown>) => AiResponseStream>();

mock.module("../ai/stream-assistant-response.ts", () => ({
  streamAssistantResponse: fakeStreamAssistantResponse
}));

const { runAgentLoop } = await import("./run-agent-loop.ts");

async function* yieldParts(parts: StreamPart[]): AsyncGenerator<StreamPart> {
  for (const part of parts) {
    yield part;
  }
}

function makeStreamResult(parts: StreamPart[]): { fullStream: AsyncIterable<StreamPart> } {
  return { fullStream: yieldParts(parts) };
}

function textPart(text: string): StreamPart {
  return { type: "text-delta", text };
}

function toolCallPart(toolCallId: string, toolName: string, input: Record<string, string>): StreamPart {
  return { type: "tool-call", toolCallId, toolName, input };
}

function finishParts(): StreamPart[] {
  return [{ type: "finish-step" }, { type: "finish" }];
}

describe("runAgentLoop", () => {
  beforeEach(() => {
    fakeStreamAssistantResponse.mockClear();
  });

  it("executes tool calls until the assistant returns final text", async () => {
    const capturedRequests: Array<{ messages: unknown[] }> = [];

    fakeStreamAssistantResponse
      .mockImplementationOnce((options) => {
        capturedRequests.push({ messages: JSON.parse(JSON.stringify(options.messages as unknown[])) as unknown[] });
        return makeStreamResult([
          toolCallPart("call_1", "echo_tool", { text: "hello" }),
          ...finishParts()
        ]);
      })
      .mockImplementationOnce((options) => {
        capturedRequests.push({ messages: JSON.parse(JSON.stringify(options.messages as unknown[])) as unknown[] });
        return makeStreamResult([
          textPart("done"),
          ...finishParts()
        ]);
      });

    const registry = new ToolRegistry([createEchoTool()]);
    const result = await runAgentLoop({
      systemPrompt: "test-system-prompt",
      initialUserPrompt: "Say hello",
      languageModel: {} as never,
      toolRegistry: registry,
      toolContext: { workspaceRoot: "/tmp/recode" },
    });

    expect(result.finalText).toBe("done");
    expect(capturedRequests).toHaveLength(2);

    const toolMessage = (capturedRequests[1]?.messages as Array<Record<string, unknown>>).find((m) => m.role === "tool");

    expect(toolMessage).toEqual({
      role: "tool",
      toolCallId: "call_1",
      toolName: "echo_tool",
      content: "echo: hello",
      isError: false
    });
  });

  it("appends previous messages before the new user prompt", async () => {
    const capturedRequests: Array<{ messages: unknown[] }> = [];

    fakeStreamAssistantResponse.mockImplementationOnce((options) => {
      capturedRequests.push({ messages: JSON.parse(JSON.stringify(options.messages as unknown[])) as unknown[] });
      return makeStreamResult([
        textPart("continued"),
        ...finishParts()
      ]);
    });

    const registry = new ToolRegistry([createEchoTool()]);
    await runAgentLoop({
      systemPrompt: "test-system-prompt",
      initialUserPrompt: "next turn",
      previousMessages: [
        { role: "user", content: "first turn" },
        { role: "assistant", content: "first reply", toolCalls: [] }
      ],
      languageModel: {} as never,
      toolRegistry: registry,
      toolContext: { workspaceRoot: "/tmp/recode" }
    });

    expect(capturedRequests[0]?.messages).toEqual([
      { role: "user", content: "first turn" },
      { role: "assistant", content: "first reply", toolCalls: [] },
      { role: "user", content: "next turn" }
    ]);
  });

  it("emits tool call notifications during stream consumption", async () => {
    fakeStreamAssistantResponse
      .mockImplementationOnce(() => makeStreamResult([
        textPart("thinking"),
        toolCallPart("call_2", "echo_tool", { text: "world" }),
        ...finishParts()
      ]))
      .mockImplementationOnce(() => makeStreamResult([
        textPart("done"),
        ...finishParts()
      ]));

    const events: Array<{ type: "text" | "tool"; value: string }> = [];
    const registry = new ToolRegistry([createEchoTool()]);
    await runAgentLoop({
      systemPrompt: "test-system-prompt",
      initialUserPrompt: "Say world",
      languageModel: {} as never,
      toolRegistry: registry,
      toolContext: { workspaceRoot: "/tmp/recode" },
      onToolCall(toolCall) {
        events.push({ type: "tool", value: `${toolCall.name}:${toolCall.id}` });
      },
      onTextDelta(delta) {
        events.push({ type: "text", value: delta });
      }
    });

    expect(events).toEqual([
      { type: "text", value: "thinking" },
      { type: "tool", value: "echo_tool:call_2" },
      { type: "text", value: "done" }
    ]);
  });

  it("streams text deltas through onTextDelta callback", async () => {
    fakeStreamAssistantResponse.mockImplementationOnce(() => makeStreamResult([
      textPart("Hello"),
      textPart(" "),
      textPart("world"),
      ...finishParts()
    ]));

    const deltas: string[] = [];
    const registry = new ToolRegistry([createEchoTool()]);
    const result = await runAgentLoop({
      systemPrompt: "test",
      initialUserPrompt: "greet",
      languageModel: {} as never,
      toolRegistry: registry,
      toolContext: { workspaceRoot: "/tmp/recode" },
      onTextDelta(delta) {
        deltas.push(delta);
      }
    });

    expect(deltas).toEqual(["Hello", " ", "world"]);
    expect(result.finalText).toBe("Hello world");
  });

  it("throws when the stream emits an error part", async () => {
    fakeStreamAssistantResponse.mockImplementationOnce(() => makeStreamResult([
      { type: "error", error: new Error("boom") }
    ]));

    const registry = new ToolRegistry([createEchoTool()]);

    await expect(runAgentLoop({
      systemPrompt: "test",
      initialUserPrompt: "greet",
      languageModel: {} as never,
      toolRegistry: registry,
      toolContext: { workspaceRoot: "/tmp/recode" }
    })).rejects.toThrow("boom");
  });

  it("throws when the stream is aborted", async () => {
    fakeStreamAssistantResponse.mockImplementationOnce(() => makeStreamResult([
      textPart("partial"),
      { type: "abort" }
    ]));

    const registry = new ToolRegistry([createEchoTool()]);

    await expect(runAgentLoop({
      systemPrompt: "test",
      initialUserPrompt: "greet",
      languageModel: {} as never,
      toolRegistry: registry,
      toolContext: { workspaceRoot: "/tmp/recode" }
    })).rejects.toThrow("Request aborted");
  });
});

function createEchoTool(): ToolDefinition {
  return {
    name: "echo_tool",
    description: "Echo a string back to the caller.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to echo."
        }
      },
      required: ["text"],
      additionalProperties: false
    },
    async execute(arguments_: ToolArguments, _context: ToolExecutionContext): Promise<ToolResult> {
      const text = arguments_["text"];

      if (typeof text !== "string") {
        throw new Error("echo_tool requires a text string.");
      }

      return {
        content: `echo: ${text}`,
        isError: false
      };
    }
  };
}
