/**
 * Question overlays for the TUI, including the context-window prompt.
 */

import { InputRenderable, TextAttributes } from "@opentui/core";
import { For, Show } from "solid-js";
import { normalizeBuiltinCommandSelectionIndex } from "./message-format.ts";
import type { ThemeColors } from "./theme.ts";
import type { ActiveQuestionRequest } from "./tui-app-types.ts";

/**
 * Props for the question overlay.
 */
export interface QuestionOverlayProps {
  readonly request: ActiveQuestionRequest | undefined;
  readonly contextWindowRequest: boolean;
  readonly theme: ThemeColors;
  readonly bindInputRef: (value: InputRenderable) => void;
  readonly onCustomTextInput: (value: string) => void;
}

/**
 * Render the active question overlay.
 */
export function QuestionOverlay(props: QuestionOverlayProps) {
  return (
    <Show when={props.request !== undefined}>
      <Show
        when={props.contextWindowRequest}
        fallback={
          <box
            position="absolute"
            left={3}
            right={3}
            bottom={1}
            zIndex={2000}
            flexDirection="column"
            border
            borderColor={props.theme.brandShimmer}
            backgroundColor={props.theme.bashMessageBackgroundColor}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
            flexShrink={0}
          >
            <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Questions</text>
            <Show when={props.request}>
              {(request: () => ActiveQuestionRequest) => {
                const activeQuestion = () => request().questions[request().currentQuestionIndex];
                const activeAnswer = () => {
                  const question = activeQuestion();
                  return question === undefined
                    ? undefined
                    : request().answers[question.id];
                };

                return (
                  <>
                    <text fg={props.theme.hintText}>
                      {`Question ${request().currentQuestionIndex + 1} of ${request().questions.length} · ←/→ to switch · Space to select · Enter to submit · ESC to dismiss`}
                    </text>
                    <Show when={activeQuestion()}>
                      {(question: () => ActiveQuestionRequest["questions"][number]) => (
                        <>
                          <text fg={props.theme.text} attributes={TextAttributes.BOLD} marginTop={1}>{question().header}</text>
                          <text fg={props.theme.assistantBody}>{question().question}</text>
                          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                            {question().multiSelect ? "Select any answers that apply." : "Select one answer."}
                          </text>
                          <box
                            flexDirection="column"
                            border
                            borderColor={props.theme.promptBorder}
                            marginTop={1}
                            paddingLeft={1}
                            paddingRight={1}
                          >
                            <For each={question().options}>
                              {(option, index) => {
                                const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                                  request().selectedOptionIndex,
                                  question().options.length
                                );
                                const chosen = () => activeAnswer()?.selectedOptionLabels.includes(option.label) ?? false;

                                return (
                                  <box flexDirection="column" marginBottom={1}>
                                    <text
                                      fg={selected() ? props.theme.brandShimmer : props.theme.text}
                                      attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                                    >
                                      {`${selected() ? "›" : " "} ${chosen() ? "[x]" : "[ ]"} ${option.label}`}
                                    </text>
                                    <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{option.description}</text>
                                  </box>
                                );
                              }}
                            </For>
                          </box>
                          <Show when={question().allowCustomText}>
                            <box
                              flexDirection="row"
                              alignItems="center"
                              marginTop={1}
                              border
                              borderColor={props.theme.promptBorder}
                              paddingLeft={1}
                              paddingRight={1}
                            >
                              <text fg={props.theme.brandShimmer}>✎ </text>
                              <input
                                ref={props.bindInputRef}
                                focused={props.request !== undefined}
                                value={activeAnswer()?.customText ?? ""}
                                flexGrow={1}
                                placeholder="Optional custom answer..."
                                onInput={props.onCustomTextInput}
                              />
                            </box>
                          </Show>
                        </>
                      )}
                    </Show>
                  </>
                );
              }}
            </Show>
          </box>
        }
      >
        <box
          position="absolute"
          left={5}
          right={5}
          bottom={1}
          zIndex={2000}
          flexDirection="column"
          border
          borderColor={props.theme.warning}
          backgroundColor={props.theme.bashMessageBackgroundColor}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <Show when={props.request}>
            {(request: () => ActiveQuestionRequest) => {
              const question = () => request().questions[0];
              const answer = () => {
                const active = question();
                return active === undefined
                  ? undefined
                  : request().answers[active.id];
              };

              return (
                <>
                  <box flexDirection="row" justifyContent="space-between" alignItems="center">
                    <text fg={props.theme.warning} attributes={TextAttributes.BOLD}>Model Context Window</text>
                    <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>Enter saves · ESC falls back</text>
                  </box>

                  <box
                    flexDirection="column"
                    marginTop={1}
                    marginBottom={1}
                    border
                    borderColor={props.theme.promptBorder}
                    paddingLeft={1}
                    paddingRight={1}
                    paddingTop={1}
                    paddingBottom={1}
                  >
                    <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>Unknown model limit</text>
                    <text fg={props.theme.assistantBody}>{question()?.question ?? ""}</text>
                    <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                      Save the real number if you know it. Otherwise Recode can use a conservative session-only guardrail.
                    </text>
                  </box>

                  <box flexDirection="row" alignItems="center" marginBottom={1}>
                    <box
                      width={14}
                      flexShrink={0}
                      border
                      borderColor={props.theme.warning}
                      paddingLeft={1}
                      paddingRight={1}
                    >
                      <text fg={props.theme.warning} attributes={TextAttributes.BOLD}>Tokens</text>
                    </box>
                    <box
                      flexDirection="row"
                      alignItems="center"
                      flexGrow={1}
                      border
                      borderColor={props.theme.brandShimmer}
                      paddingLeft={1}
                      paddingRight={1}
                    >
                      <text fg={props.theme.brandShimmer}># </text>
                      <input
                        ref={props.bindInputRef}
                        focused={props.request !== undefined}
                        value={answer()?.customText ?? ""}
                        flexGrow={1}
                        placeholder="e.g. 128000"
                        onInput={props.onCustomTextInput}
                      />
                    </box>
                  </box>

                  <box
                    flexDirection="column"
                    border
                    borderColor={props.theme.warning}
                    paddingLeft={1}
                    paddingRight={1}
                    paddingTop={1}
                    paddingBottom={1}
                  >
                    <text fg={props.theme.warning} attributes={TextAttributes.BOLD}>200k Session Fallback</text>
                    <text fg={props.theme.assistantBody}>
                      Leave the field empty and press Enter to continue with a temporary 200,000-token window for this session.
                    </text>
                    <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                      This does not overwrite your saved model config.
                    </text>
                  </box>
                </>
              );
            }}
          </Show>
        </box>
      </Show>
    </Show>
  );
}
