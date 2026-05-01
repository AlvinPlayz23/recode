/**
 * Session-step processing for the Recode agent loop.
 */

import { streamAssistantResponse } from "../ai/stream-assistant-response.ts";
import type { AiModel } from "../ai/types.ts";
import { DoomLoopDetectedError, ModelResponseError, OperationAbortedError } from "../errors/recode-error.ts";
import type { ConversationMessage, ToolCall, ToolResultMessage } from "../transcript/message.ts";
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

/**
 * Text delta observer.
 */
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
 * Dependencies for processing one model step.
 */
export interface AgentSessionStepOptions {
  readonly systemPrompt: string;
  readonly languageModel: AiModel;
  readonly toolRegistry: ToolRegistry;
  readonly abortSignal?: AbortSignal;
  readonly requestAffinityKey?: string;
  readonly onToolCall?: ToolCallObserver;
  readonly onTextDelta?: TextDeltaObserver;
}

/**
 * Dependencies for executing tools requested by one model step.
 */
export interface AgentSessionToolOptions {
  readonly toolRegistry: ToolRegistry;
  readonly toolContext: ToolExecutionContext;
  readonly abortSignal?: AbortSignal;
  readonly onToolResult?: ToolResultObserver;
}

/**
 * Result of one streamed model step.
 */
export interface AgentSessionStepResult {
  readonly assistantMessage: ConversationMessage;
  readonly toolCalls: readonly ToolCall[];
  readonly stepStats: StepStats;
  readonly accumulatedText: string;
}

/**
 * Guard against repeated identical tool-call batches.
 */
export class DoomLoopGuard {
  private previousToolSignatureBatch: string | undefined;
  private repeatedToolBatchCount = 0;

  /**
   * Throw if the current tool-call batch repeats too many times.
   */
  check(toolCalls: readonly ToolCall[]): void {
    const currentToolSignatureBatch = buildToolSignatureBatch(toolCalls);
    if (currentToolSignatureBatch === this.previousToolSignatureBatch) {
      this.repeatedToolBatchCount += 1;
    } else {
      this.previousToolSignatureBatch = currentToolSignatureBatch;
      this.repeatedToolBatchCount = 1;
    }

    if (this.repeatedToolBatchCount >= DOOM_LOOP_TURN_LIMIT) {
      throw new DoomLoopDetectedError(
        `Detected a repeated tool-call loop after ${DOOM_LOOP_TURN_LIMIT} identical turns: ${describeToolBatch(toolCalls)}`
      );
    }
  }
}

/**
 * Consume one assistant stream and return the transcript-ready assistant step.
 */
export async function processAgentSessionStep(
  options: AgentSessionStepOptions,
  messages: readonly ConversationMessage[]
): Promise<AgentSessionStepResult> {
  const turnStartedAt = Date.now();
  const stream = streamAssistantResponse({
    model: options.languageModel,
    systemPrompt: options.systemPrompt,
    messages,
    tools: options.toolRegistry.list(),
    ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
    ...(options.requestAffinityKey === undefined ? {} : { requestAffinityKey: options.requestAffinityKey })
  });

  let accumulatedText = "";
  const toolCalls: ToolCall[] = [];
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
        toolCalls.push(toolCall);
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

  throwIfAborted(options.abortSignal);

  const stepStats: StepStats = {
    finishReason: finishReason ?? inferFinishReason(toolCalls.length),
    durationMs: Math.max(0, Date.now() - turnStartedAt),
    toolCallCount: toolCalls.length,
    ...(costUsd === undefined ? {} : { costUsd }),
    ...(tokenUsage === undefined ? {} : { tokenUsage })
  };

  return {
    accumulatedText,
    toolCalls,
    stepStats,
    assistantMessage: {
      role: "assistant",
      content: accumulatedText,
      toolCalls,
      stepStats
    }
  };
}

/**
 * Execute tool calls and return transcript messages produced by the tool phase.
 */
export async function executeAgentSessionToolCalls(
  toolCalls: readonly ToolCall[],
  options: AgentSessionToolOptions
): Promise<readonly ConversationMessage[]> {
  const messages: ConversationMessage[] = [];

  for (const toolCall of toolCalls) {
    throwIfAborted(options.abortSignal);

    const toolResult = await executeToolCall(toolCall, options.toolRegistry, options.toolContext);
    messages.push(toolResult);
    options.onToolResult?.(toolResult);

    const followUpUserMessage = buildSyntheticUserMessageFromToolResult(
      toolResult.toolName,
      toolResult.content,
      toolResult.isError
    );
    if (followUpUserMessage !== undefined) {
      messages.push(followUpUserMessage);
    }
  }

  return messages;
}

function throwIfAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted ?? false) {
    throw new OperationAbortedError("Request aborted");
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
