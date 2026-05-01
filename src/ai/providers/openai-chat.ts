/**
 * Streaming adapter for OpenAI Chat Completions.
 */

import { formatContinuationSummaryForModel, type ConversationMessage } from "../../transcript/message.ts";
import type { ToolDefinition } from "../../tools/tool.ts";
import { joinUrl, readErrorMessage } from "../http.ts";
import { parseProviderToolArguments } from "../json.ts";
import { iterateSseMessages } from "../sse.ts";
import type { AiModel, AiStreamPart } from "../types.ts";
import { createEmptyStepTokenUsage, type StepTokenUsage } from "../../agent/step-stats.ts";
import {
  readNumber,
  readOptionalNumber,
  readOptionalRecord,
  readOptionalString,
  splitToolCallId
} from "./provider-json.ts";

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
      body: JSON.stringify(buildChatCompletionsRequestBody(model, systemPrompt, messages, tools)),
      ...(abortSignal === undefined ? {} : { signal: abortSignal })
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    if (response.body === null) {
      throw new Error("OpenAI Chat Completions API returned an empty response body.");
    }

    const pendingToolCalls = new Map<number, PendingChatToolCall>();
    let finishReason: string | undefined;
    let tokenUsage: StepTokenUsage | undefined;

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

      const choiceRecord = choice as Record<string, unknown>;
      const nextFinishReason = readOptionalString(choiceRecord, "finish_reason");
      if (nextFinishReason !== undefined && nextFinishReason !== "") {
        finishReason = nextFinishReason;
      }

      const usageRecord = readOptionalRecord(chunk, "usage");
      if (usageRecord !== undefined) {
        tokenUsage = {
          ...createEmptyStepTokenUsage(),
          input: readOptionalNumber(usageRecord, "prompt_tokens") ?? 0,
          output: readOptionalNumber(usageRecord, "completion_tokens") ?? 0,
          reasoning: readOptionalNumber(usageRecord, "completion_tokens_details.reasoning_tokens") ?? 0,
          cacheRead: readOptionalNumber(usageRecord, "prompt_tokens_details.cached_tokens") ?? 0,
          cacheWrite: 0
        };
      }

      const delta = readOptionalRecord(choiceRecord, "delta");
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

    yield {
      type: "finish-step",
      info: {
        ...(finishReason === undefined ? {} : { finishReason }),
        ...(tokenUsage === undefined ? {} : { tokenUsage })
      }
    };
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
  model: AiModel,
  systemPrompt: string,
  messages: readonly ConversationMessage[],
  tools: readonly ToolDefinition[]
): Record<string, unknown> {
  return {
    model: model.modelId,
    messages: messagesToChatMessages(systemPrompt, messages),
    ...(tools.length === 0 ? {} : { tools: toolsToChatTools(tools) }),
    ...(model.maxOutputTokens === undefined ? {} : { max_tokens: model.maxOutputTokens }),
    ...(model.temperature === undefined ? {} : { temperature: model.temperature }),
    ...(model.toolChoice === undefined ? {} : { tool_choice: model.toolChoice }),
    ...(supportsUsageStreaming(model) ? { stream_options: { include_usage: true } } : {}),
    stream: true
  };
}

function supportsUsageStreaming(model: AiModel): boolean {
  const baseUrl = (model.baseUrl ?? "https://api.openai.com/v1").toLowerCase();
  return baseUrl.includes("api.openai.com");
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
      case "summary":
        result.push({
          role: "user",
          content: formatContinuationSummaryForModel(message.content)
        });
        break;
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
