/**
 * Main agent loop implementation.
 *
 * @author Zhenxin
 */

import type { AiModel } from "../ai/types.ts";
import { streamAssistantResponse } from "../ai/stream-assistant-response.ts";
import { ModelResponseError, OperationAbortedError } from "../errors/recode-error.ts";
import type { ConversationMessage, ToolCall } from "../messages/message.ts";
import { formatQuestionAnswerSummary, parseQuestionToolResult } from "../tools/ask-user-question-tool.ts";
import { executeToolCall } from "../tools/execute-tool-call.ts";
import type { ToolExecutionContext } from "../tools/tool.ts";
import { ToolRegistry } from "../tools/tool-registry.ts";

/**
 * Tool call observer.
 */
export interface ToolCallObserver {
  (toolCall: ToolCall): void;
}

export interface TextDeltaObserver {
  (delta: string): void;
}

/**
 * Agent execution options.
 */
export interface AgentRunOptions {
  readonly systemPrompt: string;
  readonly initialUserPrompt: string;
  readonly previousMessages?: readonly ConversationMessage[];
  readonly languageModel: AiModel;
  readonly toolRegistry: ToolRegistry;
  readonly toolContext: ToolExecutionContext;
  readonly abortSignal?: AbortSignal;
  readonly onToolCall?: ToolCallObserver;
  readonly onTextDelta?: TextDeltaObserver;
}

/**
 * Agent execution result.
 */
export interface AgentRunResult {
  readonly finalText: string;
  readonly transcript: readonly ConversationMessage[];
  readonly iterations: number;
}

/**
 * Run the main Recode loop until the model stops requesting tools.
 */
export async function runAgentLoop(options: AgentRunOptions): Promise<AgentRunResult> {
  if (options.abortSignal?.aborted ?? false) {
    throw new OperationAbortedError("Request aborted");
  }

  const messages: ConversationMessage[] = [
    ...(options.previousMessages ?? []),
    {
      role: "user",
      content: options.initialUserPrompt
    }
  ];

  let iterations = 0;

  while (true) {
    const stream = streamAssistantResponse({
      model: options.languageModel,
      systemPrompt: options.systemPrompt,
      messages,
      tools: options.toolRegistry.list(),
      ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal })
    });

    let accumulatedText = "";
    const collectedToolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }> = [];

    for await (const part of stream.fullStream) {
      switch (part.type) {
        case "text-delta":
          accumulatedText += part.text;
          options.onTextDelta?.(part.text);
          break;
        case "error":
          throw new ModelResponseError(String(part.error));
        case "abort":
          throw new OperationAbortedError("Request aborted");
        case "tool-call": {
          const toolCall: ToolCall = {
            id: part.toolCallId,
            name: part.toolName,
            argumentsJson: JSON.stringify(part.input)
          };
          collectedToolCalls.push({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input
          });
          options.onToolCall?.(toolCall);
          break;
        }
        case "finish-step":
        case "finish":
          break;
      }
    }

    if (options.abortSignal?.aborted ?? false) {
      throw new OperationAbortedError("Request aborted");
    }

    const toolCallsFromSdk = collectedToolCalls.map((tc): ToolCall => ({
        id: tc.toolCallId,
        name: tc.toolName,
        argumentsJson: JSON.stringify(tc.input)
      })
    );

    const assistantMessage: ConversationMessage = {
      role: "assistant",
      content: accumulatedText,
      toolCalls: toolCallsFromSdk
    };

    messages.push(assistantMessage);

    iterations += 1;

    if (toolCallsFromSdk.length === 0) {
      return {
        finalText: accumulatedText,
        transcript: [...messages],
        iterations
      };
    }

    for (const toolCall of toolCallsFromSdk) {
      if (options.abortSignal?.aborted ?? false) {
        throw new OperationAbortedError("Request aborted");
      }

      const toolResult = await executeToolCall(toolCall, options.toolRegistry, options.toolContext);
      messages.push(toolResult);
      const followUpUserMessage = buildSyntheticUserMessageFromToolResult(toolResult.toolName, toolResult.content, toolResult.isError);
      if (followUpUserMessage !== undefined) {
        messages.push(followUpUserMessage);
      }
    }
  }
}

function buildSyntheticUserMessageFromToolResult(
  toolName: string,
  content: string,
  isError: boolean
): ConversationMessage | undefined {
  if (isError || toolName !== "AskUserQuestion") {
    return undefined;
  }

  const parsed = parseQuestionToolResult(content);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    role: "user",
    content: formatQuestionAnswerSummary(parsed)
  };
}
