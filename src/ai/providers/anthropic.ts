/**
 * Streaming adapter for Anthropic Messages.
 */

import type { ConversationMessage } from "../../messages/message.ts";
import type { ToolDefinition } from "../../tools/tool.ts";
import { joinUrl, readErrorMessage } from "../http.ts";
import { parseProviderToolArguments } from "../json.ts";
import { iterateSseMessages } from "../sse.ts";
import type { AiModel, AiStreamPart } from "../types.ts";

interface PendingAnthropicToolUse {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  argumentsJson: string;
}

/**
 * Stream a response from the Anthropic Messages API.
 */
export async function* streamAnthropicMessages(
  model: AiModel,
  systemPrompt: string,
  messages: readonly ConversationMessage[],
  tools: readonly ToolDefinition[],
  abortSignal?: AbortSignal
): AsyncGenerator<AiStreamPart> {
  try {
    const response = await fetch(joinUrl(model.baseUrl ?? "https://api.anthropic.com/v1", "/messages"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": model.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(buildAnthropicRequestBody(model.modelId, systemPrompt, messages, tools)),
      ...(abortSignal === undefined ? {} : { signal: abortSignal })
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    if (response.body === null) {
      throw new Error("Anthropic Messages API returned an empty response body.");
    }

    const pendingToolUses = new Map<number, PendingAnthropicToolUse>();

    for await (const sse of iterateSseMessages(response.body, abortSignal)) {
      if (sse.data === "[DONE]") {
        continue;
      }

      const event = JSON.parse(sse.data) as Record<string, unknown>;
      const eventType = typeof event["type"] === "string" ? event["type"] : sse.event;

      switch (eventType) {
        case "content_block_start": {
          const index = readNumber(event, "index");
          const contentBlock = readRecord(event, "content_block");
          const contentBlockType = readString(contentBlock, "type");

          if (contentBlockType === "tool_use") {
            pendingToolUses.set(index, {
              index,
              id: readString(contentBlock, "id"),
              name: readString(contentBlock, "name"),
              argumentsJson: JSON.stringify(readOptionalRecord(contentBlock, "input") ?? {})
            });
          }
          break;
        }
        case "content_block_delta": {
          const index = readNumber(event, "index");
          const delta = readRecord(event, "delta");
          const deltaType = readString(delta, "type");

          if (deltaType === "text_delta") {
            const text = readString(delta, "text");
            if (text !== "") {
              yield { type: "text-delta", text };
            }
          } else if (deltaType === "input_json_delta") {
            const pendingToolUse = pendingToolUses.get(index);
            if (pendingToolUse !== undefined) {
              pendingToolUse.argumentsJson += readString(delta, "partial_json");
            }
          }
          break;
        }
        case "content_block_stop": {
          const index = readNumber(event, "index");
          const pendingToolUse = pendingToolUses.get(index);
          if (pendingToolUse !== undefined) {
            yield {
              type: "tool-call",
              toolCallId: pendingToolUse.id,
              toolName: pendingToolUse.name,
              input: parseProviderToolArguments(pendingToolUse.argumentsJson, "anthropic", pendingToolUse.name)
            };
            pendingToolUses.delete(index);
          }
          break;
        }
        case "error": {
          const errorRecord = readOptionalRecord(event, "error");
          if (errorRecord !== undefined) {
            throw new Error(readOptionalString(errorRecord, "message") ?? "Anthropic API reported an error.");
          }
          throw new Error("Anthropic API reported an error.");
        }
      }
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

function buildAnthropicRequestBody(
  modelId: string,
  systemPrompt: string,
  messages: readonly ConversationMessage[],
  tools: readonly ToolDefinition[]
): Record<string, unknown> {
  return {
    model: modelId,
    max_tokens: 4096,
    ...(systemPrompt.trim() === "" ? {} : { system: systemPrompt }),
    messages: messagesToAnthropicMessages(messages),
    ...(tools.length === 0 ? {} : { tools: toolsToAnthropicTools(tools) }),
    stream: true
  };
}

function messagesToAnthropicMessages(messages: readonly ConversationMessage[]): readonly Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message === undefined) {
      continue;
    }

    switch (message.role) {
      case "user":
        result.push({
          role: "user",
          content: message.content
        });
        break;
      case "assistant": {
        const contentBlocks: Record<string, unknown>[] = [];

        if (message.content !== "") {
          contentBlocks.push({
            type: "text",
            text: message.content
          });
        }

        for (const toolCall of message.toolCalls) {
          contentBlocks.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.name,
            input: JSON.parse(toolCall.argumentsJson) as Record<string, unknown>
          });
        }

        if (contentBlocks.length > 0) {
          result.push({
            role: "assistant",
            content: contentBlocks
          });
        }
        break;
      }
      case "tool": {
        const toolResults: Record<string, unknown>[] = [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: message.content,
            is_error: message.isError
          }
        ];

        while (index + 1 < messages.length && messages[index + 1]?.role === "tool") {
          index += 1;
          const nextToolResult = messages[index];
          if (nextToolResult === undefined) {
            continue;
          }
          if (nextToolResult.role !== "tool") {
            continue;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: nextToolResult.toolCallId,
            content: nextToolResult.content,
            is_error: nextToolResult.isError
          });
        }

        result.push({
          role: "user",
          content: toolResults
        });
        break;
      }
    }
  }

  return result;
}

function toolsToAnthropicTools(tools: readonly ToolDefinition[]): readonly Record<string, unknown>[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected '${key}' to be an object.`);
  }
  return value as Record<string, unknown>;
}

function readOptionalRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  return readRecord(record, key);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`Expected '${key}' to be a string.`);
  }
  return value;
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
