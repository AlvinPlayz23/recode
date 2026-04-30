/**
 * Main agent loop implementation.
 *
 * @author Zhenxin
 */

import type { AiModel } from "../ai/types.ts";
import { streamAssistantResponse } from "../ai/stream-assistant-response.ts";
import { ModelResponseError, OperationAbortedError, DoomLoopDetectedError } from "../errors/recode-error.ts";
import type { ConversationMessage, ToolCall, ToolResultMessage } from "../messages/message.ts";
import { formatQuestionAnswerSummary, parseQuestionToolResult } from "../tools/ask-user-question-tool.ts";
import { executeToolCall } from "../tools/execute-tool-call.ts";
import type { ToolExecutionContext } from "../tools/tool.ts";
import { ToolRegistry } from "../tools/tool-registry.ts";
import type { StepStats } from "./step-stats.ts";

const DOOM_LOOP_TURN_LIMIT = 3;

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
 * Tool result observer.
 */
export interface ToolResultObserver {
  (toolResult: ToolResultMessage): void;
}

/**
 * Step completion observer.
 */
export interface StepObserver {
  (step: StepStats): void;
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
  readonly onToolResult?: ToolResultObserver;
  readonly onStepComplete?: StepObserver;
}

/**
 * Agent execution result.
 */
export interface AgentRunResult {
  readonly finalText: string;
  readonly transcript: readonly ConversationMessage[];
  readonly iterations: number;
  readonly steps: readonly StepStats[];
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
  const steps: StepStats[] = [];
  let previousToolSignatureBatch: string | undefined;
  let repeatedToolBatchCount = 0;

  while (true) {
    const turnStartedAt = Date.now();
    const stream = streamAssistantResponse({
      model: options.languageModel,
      systemPrompt: options.systemPrompt,
      messages,
      tools: options.toolRegistry.list(),
      ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal })
    });

    let accumulatedText = "";
    const collectedToolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }> = [];
    let finishReason: string | undefined;
    let tokenUsage: StepStats["tokenUsage"] | undefined;
    let costUsd: number | undefined;

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
          finishReason = part.info?.finishReason ?? finishReason;
          tokenUsage = part.info?.tokenUsage ?? tokenUsage;
          costUsd = part.info?.costUsd ?? costUsd;
          break;
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

    const stepStats: StepStats = {
      finishReason: finishReason ?? inferFinishReason(toolCallsFromSdk.length),
      durationMs: Math.max(0, Date.now() - turnStartedAt),
      toolCallCount: toolCallsFromSdk.length,
      ...(costUsd === undefined ? {} : { costUsd }),
      ...(tokenUsage === undefined ? {} : { tokenUsage })
    };

    const assistantMessage: ConversationMessage = {
      role: "assistant",
      content: accumulatedText,
      toolCalls: toolCallsFromSdk,
      stepStats
    };

    messages.push(assistantMessage);
    steps.push(stepStats);
    options.onStepComplete?.(stepStats);

    iterations += 1;

    if (toolCallsFromSdk.length === 0) {
      return {
        finalText: accumulatedText,
        transcript: [...messages],
        iterations,
        steps
      };
    }

    const currentToolSignatureBatch = buildToolSignatureBatch(toolCallsFromSdk);
    if (currentToolSignatureBatch === previousToolSignatureBatch) {
      repeatedToolBatchCount += 1;
    } else {
      previousToolSignatureBatch = currentToolSignatureBatch;
      repeatedToolBatchCount = 1;
    }

    if (repeatedToolBatchCount >= DOOM_LOOP_TURN_LIMIT) {
      throw new DoomLoopDetectedError(
        `Detected a repeated tool-call loop after ${DOOM_LOOP_TURN_LIMIT} identical turns: ${describeToolBatch(toolCallsFromSdk)}`
      );
    }

    for (const toolCall of toolCallsFromSdk) {
      if (options.abortSignal?.aborted ?? false) {
        throw new OperationAbortedError("Request aborted");
      }

      const toolResult = await executeToolCall(toolCall, options.toolRegistry, options.toolContext);
      messages.push(toolResult);
      options.onToolResult?.(toolResult);
      const followUpUserMessage = buildSyntheticUserMessageFromToolResult(toolResult.toolName, toolResult.content, toolResult.isError);
      if (followUpUserMessage !== undefined) {
        messages.push(followUpUserMessage);
      }
    }
  }
}

function inferFinishReason(toolCallCount: number): string {
  return toolCallCount > 0 ? "tool_calls" : "stop";
}

function buildToolSignatureBatch(toolCalls: readonly ToolCall[]): string {
  return toolCalls
    .map((toolCall) => `${toolCall.name}:${toolCall.argumentsJson}`)
    .join("\n");
}

function describeToolBatch(toolCalls: readonly ToolCall[]): string {
  return toolCalls
    .map((toolCall) => toolCall.name)
    .join(", ");
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
