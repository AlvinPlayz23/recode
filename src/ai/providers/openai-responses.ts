/**
 * Streaming adapter for the OpenAI Responses API.
 */

import { formatContinuationSummaryForModel, type ConversationMessage } from "../../messages/message.ts";
import type { ToolDefinition } from "../../tools/tool.ts";
import { joinUrl, readErrorMessage } from "../http.ts";
import { parseProviderToolArguments } from "../json.ts";
import { iterateSseMessages } from "../sse.ts";
import type { AiModel, AiStreamPart } from "../types.ts";
import { createEmptyStepTokenUsage, type StepTokenUsage } from "../../agent/step-stats.ts";

interface ResponsesRequestBody {
  readonly model: string;
  readonly instructions?: string;
  readonly input: readonly unknown[];
  readonly tools?: readonly unknown[];
  readonly max_output_tokens?: number;
  readonly temperature?: number;
  readonly tool_choice?: "auto" | "required";
  readonly stream: true;
  readonly store: false;
}

interface PendingFunctionCall {
  callId: string;
  itemId: string | undefined;
  name: string;
  argumentsJson: string;
}

/**
 * Stream a response from the OpenAI Responses API.
 */
export async function* streamOpenAiResponses(
  model: AiModel,
  systemPrompt: string,
  messages: readonly ConversationMessage[],
  tools: readonly ToolDefinition[],
  abortSignal?: AbortSignal
): AsyncGenerator<AiStreamPart> {
  try {
    const response = await fetch(joinUrl(model.baseUrl ?? "https://api.openai.com/v1", "/responses"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${model.apiKey}`
      },
      body: JSON.stringify(buildResponsesRequestBody(model, systemPrompt, messages, tools)),
      ...(abortSignal === undefined ? {} : { signal: abortSignal })
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    if (response.body === null) {
      throw new Error("OpenAI Responses API returned an empty response body.");
    }

    let pendingFunctionCall: PendingFunctionCall | undefined;
    let finishInfo: { finishReason?: string; costUsd?: number; tokenUsage?: StepTokenUsage } | undefined;

    for await (const sse of iterateSseMessages(response.body, abortSignal)) {
      if (sse.data === "[DONE]") {
        continue;
      }

      const event = JSON.parse(sse.data) as Record<string, unknown>;
      const eventType = typeof event["type"] === "string" ? event["type"] : sse.event;

      switch (eventType) {
        case "response.output_item.added": {
          const item = readRecord(event, "item");
          const itemType = readString(item, "type");
          if (itemType === "function_call") {
            pendingFunctionCall = {
              callId: readString(item, "call_id"),
              itemId: readOptionalString(item, "id"),
              name: readString(item, "name"),
              argumentsJson: readOptionalString(item, "arguments") ?? ""
            };
          } else {
            pendingFunctionCall = undefined;
          }
          break;
        }
        case "response.output_text.delta":
        case "response.refusal.delta": {
          const delta = readString(event, "delta");
          if (delta !== "") {
            yield { type: "text-delta", text: delta };
          }
          break;
        }
        case "response.function_call_arguments.delta": {
          if (pendingFunctionCall !== undefined) {
            pendingFunctionCall.argumentsJson += readString(event, "delta");
          }
          break;
        }
        case "response.function_call_arguments.done": {
          if (pendingFunctionCall !== undefined) {
            pendingFunctionCall.argumentsJson = readString(event, "arguments");
          }
          break;
        }
        case "response.output_item.done": {
          const item = readRecord(event, "item");
          const itemType = readString(item, "type");

          if (itemType === "function_call") {
            const toolName = readString(item, "name");
            const toolCallId = buildResponsesToolCallId(readString(item, "call_id"), readOptionalString(item, "id"));
            const argumentsJson = readOptionalString(item, "arguments")
              ?? pendingFunctionCall?.argumentsJson
              ?? "{}";

            yield {
              type: "tool-call",
              toolCallId,
              toolName,
              input: parseProviderToolArguments(argumentsJson, "openai-responses", toolName)
            };
            pendingFunctionCall = undefined;
          } else {
            pendingFunctionCall = undefined;
          }
          break;
        }
        case "response.failed": {
          const responseRecord = readOptionalRecord(event, "response");
          const errorRecord = responseRecord === undefined ? undefined : readOptionalRecord(responseRecord, "error");
          if (errorRecord !== undefined) {
            const errorMessage = readOptionalString(errorRecord, "message");
            if (errorMessage !== undefined && errorMessage.trim() !== "") {
              throw new Error(errorMessage);
            }
          }
          throw new Error("OpenAI Responses API reported a failure.");
        }
        case "response.completed": {
          const responseRecord = readOptionalRecord(event, "response");
          if (responseRecord !== undefined) {
            finishInfo = readResponsesFinishInfo(responseRecord);
          }
          break;
        }
        case "response.incomplete": {
          const responseRecord = readOptionalRecord(event, "response");
          if (responseRecord !== undefined) {
            finishInfo = {
              ...readResponsesFinishInfo(responseRecord),
              finishReason: "max_output_tokens"
            };
          }
          break;
        }
        case "error":
          throw new Error(readString(event, "message"));
      }
    }

    if (abortSignal?.aborted ?? false) {
      yield { type: "abort" };
      return;
    }

    yield { type: "finish-step", ...(finishInfo === undefined ? {} : { info: finishInfo }) };
    yield { type: "finish" };
  } catch (error) {
    if (abortSignal?.aborted ?? false) {
      yield { type: "abort" };
      return;
    }

    yield { type: "error", error };
  }
}

function buildResponsesRequestBody(
  model: AiModel,
  systemPrompt: string,
  messages: readonly ConversationMessage[],
  tools: readonly ToolDefinition[]
): ResponsesRequestBody {
  return {
    model: model.modelId,
    ...(systemPrompt.trim() === "" ? {} : { instructions: systemPrompt }),
    input: messagesToResponsesInput(messages),
    ...(tools.length === 0 ? {} : { tools: toolsToResponsesTools(tools) }),
    ...(model.maxOutputTokens === undefined ? {} : { max_output_tokens: model.maxOutputTokens }),
    ...(model.temperature === undefined ? {} : { temperature: model.temperature }),
    ...(model.toolChoice === undefined ? {} : { tool_choice: model.toolChoice }),
    stream: true,
    store: false
  };
}

function messagesToResponsesInput(messages: readonly ConversationMessage[]): readonly unknown[] {
  const input: unknown[] = [];

  for (const message of messages) {
    switch (message.role) {
      case "user":
        input.push({
          role: "user",
          content: [{ type: "input_text", text: message.content }]
        });
        break;
      case "assistant":
        if (message.content !== "") {
          input.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: message.content }]
          });
        }

        for (const toolCall of message.toolCalls) {
          input.push({
            type: "function_call",
            call_id: splitToolCallId(toolCall.id),
            name: toolCall.name,
            arguments: toolCall.argumentsJson
          });
        }
        break;
      case "summary":
        input.push({
          role: "user",
          content: [{ type: "input_text", text: formatContinuationSummaryForModel(message.content) }]
        });
        break;
      case "tool":
        input.push({
          type: "function_call_output",
          call_id: splitToolCallId(message.toolCallId),
          output: message.content
        });
        break;
    }
  }

  return input;
}

function toolsToResponsesTools(tools: readonly ToolDefinition[]): readonly unknown[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  }));
}

function splitToolCallId(toolCallId: string): string {
  const separatorIndex = toolCallId.indexOf("|");
  return separatorIndex === -1 ? toolCallId : toolCallId.slice(0, separatorIndex);
}

function buildResponsesToolCallId(callId: string, itemId: string | undefined): string {
  return itemId === undefined || itemId === "" ? callId : `${callId}|${itemId}`;
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

function readResponsesFinishInfo(response: Record<string, unknown>): {
  finishReason?: string;
  costUsd?: number;
  tokenUsage?: StepTokenUsage;
} {
  const usage = readOptionalRecord(response, "usage");
  const tokenUsage = usage === undefined ? undefined : {
    ...createEmptyStepTokenUsage(),
    input: readOptionalNumber(usage, "input_tokens") ?? 0,
    output: readOptionalNumber(usage, "output_tokens") ?? 0,
    reasoning: readOptionalNumber(usage, "reasoning_tokens") ?? 0,
    cacheRead: readOptionalNumber(usage, "input_tokens_details.cached_tokens") ?? 0,
    cacheWrite: 0
  };

  const status = readOptionalString(response, "status");
  return {
    ...(status === undefined ? {} : { finishReason: status }),
    ...(tokenUsage === undefined ? {} : { tokenUsage })
  };
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  if (key.includes(".")) {
    const [head, ...tail] = key.split(".");
    const next = head === undefined ? undefined : record[head];
    if (tail.length === 0 || next === undefined || next === null || typeof next !== "object" || Array.isArray(next)) {
      return undefined;
    }
    return readOptionalNumber(next as Record<string, unknown>, tail.join("."));
  }

  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
