/**
 * Streaming adapter for OpenAI Chat Completions.
 */

import type { ConversationMessage } from "../../messages/message.ts";
import type { ToolDefinition } from "../../tools/tool.ts";
import { joinUrl, readErrorMessage } from "../http.ts";
import { parseProviderToolArguments } from "../json.ts";
import { iterateSseMessages } from "../sse.ts";
import type { AiModel, AiStreamPart } from "../types.ts";

interface PendingChatToolCall {
  id: string;
  name: string;
  argumentsJson: string;
  index: number;
}

/**
 * Stream a response from the OpenAI Chat Completions API.
 */
export async function* streamOpenAiChat(
  model: AiModel,
  systemPrompt: string,
  messages: readonly ConversationMessage[],
  tools: readonly ToolDefinition[],
  abortSignal?: AbortSignal
): AsyncGenerator<AiStreamPart> {
  try {
    const response = await fetch(joinUrl(model.baseUrl ?? "https://api.openai.com/v1", "/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${model.apiKey}`
      },
      body: JSON.stringify(buildChatCompletionsRequestBody(model.modelId, systemPrompt, messages, tools)),
      ...(abortSignal === undefined ? {} : { signal: abortSignal })
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    if (response.body === null) {
      throw new Error("OpenAI Chat Completions API returned an empty response body.");
    }

    const pendingToolCalls = new Map<number, PendingChatToolCall>();

    for await (const sse of iterateSseMessages(response.body, abortSignal)) {
      if (sse.data === "[DONE]") {
        break;
      }

      const chunk = JSON.parse(sse.data) as Record<string, unknown>;
      const errorRecord = readOptionalRecord(chunk, "error");
      if (errorRecord !== undefined) {
        throw new Error(readOptionalString(errorRecord, "message") ?? "OpenAI-compatible API reported an error.");
      }

      const choices = chunk["choices"];
      if (!Array.isArray(choices) || choices.length === 0) {
        continue;
      }

      const choice = choices[0];
      if (choice === null || typeof choice !== "object" || Array.isArray(choice)) {
        continue;
      }

      const delta = readOptionalRecord(choice as Record<string, unknown>, "delta");
      if (delta !== undefined) {
        const content = readOptionalString(delta, "content");
        if (content !== undefined && content !== "") {
          yield { type: "text-delta", text: content };
        }

        const rawToolCalls = delta["tool_calls"];
        if (Array.isArray(rawToolCalls)) {
          for (const rawToolCall of rawToolCalls) {
            if (rawToolCall === null || typeof rawToolCall !== "object" || Array.isArray(rawToolCall)) {
              continue;
            }

            const toolCall = rawToolCall as Record<string, unknown>;
            const index = readNumber(toolCall, "index");
            const current = pendingToolCalls.get(index) ?? {
              id: "",
              name: "",
              argumentsJson: "",
              index
            };
            const id = readOptionalString(toolCall, "id");
            if (id !== undefined && id !== "") {
              current.id = id;
            }

            const functionRecord = readOptionalRecord(toolCall, "function");
            if (functionRecord !== undefined) {
              const name = readOptionalString(functionRecord, "name");
              if (name !== undefined && name !== "") {
                current.name = name;
              }

              const argumentsChunk = readOptionalString(functionRecord, "arguments");
              if (argumentsChunk !== undefined && argumentsChunk !== "") {
                current.argumentsJson += argumentsChunk;
              }
            }

            pendingToolCalls.set(index, current);
          }
        }
      }
    }

    const orderedToolCalls = [...pendingToolCalls.values()].sort((left, right) => left.index - right.index);
    for (const toolCall of orderedToolCalls) {
      yield {
        type: "tool-call",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        input: parseProviderToolArguments(toolCall.argumentsJson, "openai-chat-completions", toolCall.name)
      };
    }

    if (abortSignal?.aborted ?? false) {
      yield { type: "abort" };
      return;
    }

    yield { type: "finish-step" };
    yield { type: "finish" };
  } catch (error) {
    if (abortSignal?.aborted ?? false) {
      yield { type: "abort" };
      return;
    }

    yield { type: "error", error };
  }
}

function buildChatCompletionsRequestBody(
  modelId: string,
  systemPrompt: string,
  messages: readonly ConversationMessage[],
  tools: readonly ToolDefinition[]
): Record<string, unknown> {
  return {
    model: modelId,
    messages: messagesToChatMessages(systemPrompt, messages),
    ...(tools.length === 0 ? {} : { tools: toolsToChatTools(tools) }),
    stream: true
  };
}

function messagesToChatMessages(systemPrompt: string, messages: readonly ConversationMessage[]): readonly Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];

  if (systemPrompt.trim() !== "") {
    result.push({
      role: "system",
      content: systemPrompt
    });
  }

  for (const message of messages) {
    switch (message.role) {
      case "user":
        result.push({
          role: "user",
          content: message.content
        });
        break;
      case "assistant": {
        const toolCalls = message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.argumentsJson
          }
        }));

        result.push({
          role: "assistant",
          content: message.content === "" && toolCalls.length > 0 ? "" : message.content,
          ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls })
        });
        break;
      }
      case "tool":
        result.push({
          role: "tool",
          tool_call_id: splitToolCallId(message.toolCallId),
          content: message.content
        });
        break;
    }
  }

  return result;
}

function toolsToChatTools(tools: readonly ToolDefinition[]): readonly Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
}

function splitToolCallId(toolCallId: string): string {
  const separatorIndex = toolCallId.indexOf("|");
  return separatorIndex === -1 ? toolCallId : toolCallId.slice(0, separatorIndex);
}

function readOptionalRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new Error(`Expected '${key}' to be a number.`);
  }
  return value;
}
