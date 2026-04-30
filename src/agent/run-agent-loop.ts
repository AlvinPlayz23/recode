/**
 * Main agent loop implementation.
 *
 * @author Zhenxin
 */

import type { AiModel } from "../ai/types.ts";
import { OperationAbortedError } from "../errors/recode-error.ts";
import type { ConversationMessage } from "../messages/message.ts";
import type { ToolExecutionContext } from "../tools/tool.ts";
import { ToolRegistry } from "../tools/tool-registry.ts";
import type { StepStats } from "./step-stats.ts";
import {
  DoomLoopGuard,
  executeAgentSessionToolCalls,
  processAgentSessionStep,
  type StepObserver,
  type TextDeltaObserver,
  type ToolCallObserver,
  type ToolResultObserver
} from "./session-processor.ts";

export type {
  StepObserver,
  TextDeltaObserver,
  ToolCallObserver,
  ToolResultObserver
} from "./session-processor.ts";

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
  const doomLoopGuard = new DoomLoopGuard();

  while (true) {
    const step = await processAgentSessionStep({
      systemPrompt: options.systemPrompt,
      languageModel: options.languageModel,
      toolRegistry: options.toolRegistry,
      ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
      ...(options.onToolCall === undefined ? {} : { onToolCall: options.onToolCall }),
      ...(options.onTextDelta === undefined ? {} : { onTextDelta: options.onTextDelta })
    }, messages);

    messages.push(step.assistantMessage);
    steps.push(step.stepStats);
    options.onStepComplete?.(step.stepStats);

    iterations += 1;

    if (step.toolCalls.length === 0) {
      return {
        finalText: step.accumulatedText,
        transcript: [...messages],
        iterations,
        steps
      };
    }

    doomLoopGuard.check(step.toolCalls);
    messages.push(...await executeAgentSessionToolCalls(step.toolCalls, {
      toolRegistry: options.toolRegistry,
      toolContext: options.toolContext,
      ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
      ...(options.onToolResult === undefined ? {} : { onToolResult: options.onToolResult })
    }));
  }
}
