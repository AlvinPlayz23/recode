/**
 * Approval and question prompt workflow helpers for the TUI.
 */

import type {
  QuestionAnswer,
  QuestionToolDecision,
  QuestionToolRequest,
  ToolApprovalDecision,
  ToolApprovalRequest,
  ToolApprovalScope
} from "../tools/tool.ts";
import {
  moveBuiltinCommandSelectionIndex,
  normalizeBuiltinCommandSelectionIndex
} from "./message-format.ts";
import { summarizeToolArguments } from "./transcript-entry-state.ts";
import type {
  ActiveApprovalRequest,
  ActiveQuestionRequest
} from "./tui-app-types.ts";
import type { ApprovalDecisionOption } from "./tool-approval-overlay.tsx";

/**
 * Fixed decisions shown in the tool approval overlay.
 */
export const APPROVAL_DECISIONS: readonly ApprovalDecisionOption[] = [
  {
    decision: "allow-once",
    label: "Allow once",
    description: "Run this tool call now and ask again next time."
  },
  {
    decision: "allow-always",
    label: "Always allow this scope",
    description: "Persist this tool scope in the config allowlist."
  },
  {
    decision: "deny",
    label: "Deny",
    description: "Reject this tool call."
  }
] as const satisfies readonly {
  readonly decision: ToolApprovalDecision;
  readonly label: string;
  readonly description: string;
}[];

/**
 * Result of trying to submit a question request.
 */
export type QuestionSubmission =
  | {
      readonly kind: "submit";
      readonly decision: QuestionToolDecision;
    }
  | {
      readonly kind: "missing-answer";
      readonly header: string;
    };

/**
 * Build the active approval request stored by the TUI.
 */
export function createActiveApprovalRequest(
  request: ToolApprovalRequest,
  resolve: (decision: ToolApprovalDecision) => void
): ActiveApprovalRequest {
  return {
    ...request,
    selectedIndex: 0,
    resolve
  };
}

/**
 * Build the active question request stored by the TUI.
 */
export function createActiveQuestionRequest(
  request: QuestionToolRequest,
  resolve: (decision: QuestionToolDecision) => void
): ActiveQuestionRequest {
  return {
    ...request,
    currentQuestionIndex: 0,
    selectedOptionIndex: 0,
    answers: createInitialQuestionAnswers(request),
    resolve
  };
}

/**
 * Return the next allowlist when an approval decision should persist a scope.
 */
export function getNextApprovalAllowlist(
  decision: ToolApprovalDecision,
  scope: ToolApprovalScope,
  approvalAllowlist: readonly ToolApprovalScope[]
): readonly ToolApprovalScope[] {
  if (decision !== "allow-always" || scope === "read" || approvalAllowlist.includes(scope)) {
    return approvalAllowlist;
  }

  return [...approvalAllowlist, scope];
}

/**
 * Format the title for a tool approval prompt.
 */
export function formatApprovalRequestTitle(request: ToolApprovalRequest): string {
  return `${request.toolName} wants ${request.scope} access.`;
}

/**
 * Format the detail line for a tool approval prompt.
 */
export function formatApprovalRequestDescription(request: ToolApprovalRequest): string {
  const summary = summarizeToolArguments(request.toolName, JSON.stringify(request.arguments));
  return summary === ""
    ? "Choose how Recode should handle this tool call."
    : `Details: ${summary}`;
}

/**
 * Check whether a question request is the special context-window prompt.
 */
export function isContextWindowQuestionRequest(
  request: ActiveQuestionRequest | QuestionToolRequest | undefined
): boolean {
  return request?.questions.length === 1 && request.questions[0]?.id === "context-window";
}

/**
 * Build the fallback context-window decision used when the user submits an empty context answer.
 */
export function buildContextWindowFallbackDecision(request: ActiveQuestionRequest): QuestionToolDecision {
  const question = request.questions[0];
  return {
    dismissed: false,
    answers: [
      {
        questionId: question?.id ?? "context-window",
        selectedOptionLabels: [question?.options[0]?.label ?? "Use fallback"],
        customText: ""
      }
    ]
  };
}

/**
 * Move between questions in a multi-question prompt.
 */
export function moveQuestionIndex(
  request: ActiveQuestionRequest | undefined,
  direction: -1 | 1
): ActiveQuestionRequest | undefined {
  if (request === undefined) {
    return request;
  }

  const nextIndex = (request.currentQuestionIndex + direction + request.questions.length) % request.questions.length;
  const nextQuestion = request.questions[nextIndex];
  return nextQuestion === undefined
    ? request
    : {
        ...request,
        currentQuestionIndex: nextIndex,
        selectedOptionIndex: normalizeBuiltinCommandSelectionIndex(
          request.selectedOptionIndex,
          nextQuestion.options.length
        )
      };
}

/**
 * Move between options on the active question.
 */
export function moveQuestionOptionIndex(
  request: ActiveQuestionRequest | undefined,
  direction: -1 | 1
): ActiveQuestionRequest | undefined {
  if (request === undefined) {
    return request;
  }

  const activeQuestion = request.questions[request.currentQuestionIndex];
  if (activeQuestion === undefined) {
    return request;
  }

  return {
    ...request,
    selectedOptionIndex: moveBuiltinCommandSelectionIndex(
      request.selectedOptionIndex,
      activeQuestion.options.length,
      direction
    )
  };
}

/**
 * Toggle the selected option on the active question.
 */
export function toggleQuestionOption(
  request: ActiveQuestionRequest | undefined
): ActiveQuestionRequest | undefined {
  if (request === undefined) {
    return request;
  }

  const activeQuestion = request.questions[request.currentQuestionIndex];
  if (activeQuestion === undefined) {
    return request;
  }

  const option = activeQuestion.options[
    normalizeBuiltinCommandSelectionIndex(request.selectedOptionIndex, activeQuestion.options.length)
  ];
  if (option === undefined) {
    return request;
  }

  const answer = request.answers[activeQuestion.id] ?? createEmptyQuestionAnswer(activeQuestion.id);
  const isSelected = answer.selectedOptionLabels.includes(option.label);
  const selectedOptionLabels = activeQuestion.multiSelect
    ? isSelected
      ? answer.selectedOptionLabels.filter((label) => label !== option.label)
      : [...answer.selectedOptionLabels, option.label]
    : isSelected
      ? []
      : [option.label];

  return {
    ...request,
    answers: {
      ...request.answers,
      [activeQuestion.id]: {
        ...answer,
        selectedOptionLabels
      }
    }
  };
}

/**
 * Update the custom text answer for the active question.
 */
export function updateQuestionCustomText(
  request: ActiveQuestionRequest | undefined,
  value: string
): ActiveQuestionRequest | undefined {
  if (request === undefined) {
    return request;
  }

  const currentQuestion = request.questions[request.currentQuestionIndex];
  if (currentQuestion === undefined) {
    return request;
  }

  const currentAnswer = request.answers[currentQuestion.id] ?? createEmptyQuestionAnswer(currentQuestion.id);

  return {
    ...request,
    answers: {
      ...request.answers,
      [currentQuestion.id]: {
        ...currentAnswer,
        customText: value
      }
    }
  };
}

/**
 * Build a submit decision or report which question still needs an answer.
 */
export function buildQuestionSubmission(request: ActiveQuestionRequest): QuestionSubmission {
  const answers = request.questions.map((question) => request.answers[question.id] ?? createEmptyQuestionAnswer(question.id));
  const unanswered = request.questions.find((question, index) => {
    const answer = answers[index];
    return answer !== undefined
      && answer.selectedOptionLabels.length === 0
      && answer.customText.trim() === "";
  });

  if (unanswered !== undefined) {
    if (isContextWindowQuestionRequest(request)) {
      return {
        kind: "submit",
        decision: buildContextWindowFallbackDecision(request)
      };
    }

    return {
      kind: "missing-answer",
      header: unanswered.header
    };
  }

  return {
    kind: "submit",
    decision: {
      dismissed: false,
      answers
    }
  };
}

function createInitialQuestionAnswers(request: QuestionToolRequest): Readonly<Record<string, QuestionAnswer>> {
  return Object.fromEntries(request.questions.map((question) => [
    question.id,
    createEmptyQuestionAnswer(question.id)
  ]));
}

function createEmptyQuestionAnswer(questionId: string): QuestionAnswer {
  return {
    questionId,
    selectedOptionLabels: [],
    customText: ""
  };
}
