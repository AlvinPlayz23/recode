/**
 * Question overlays for the TUI, including the context-window prompt.
 */

import { InputRenderable, type KeyEvent, RGBA, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { For, Show } from "solid-js";
import { normalizeBuiltinCommandSelectionIndex } from "../message-format.ts";
import type { ThemeColors } from "../appearance/theme.ts";
import type { ActiveQuestionRequest } from "../tui-app-types.ts";

/**
 * Props for the question overlay.
 */
export interface QuestionOverlayProps {
  readonly request: ActiveQuestionRequest | undefined;
  readonly contextWindowRequest: boolean;
  readonly theme: ThemeColors;
  readonly bindInputRef: (value: InputRenderable) => void;
  readonly onCustomTextInput: (value: string) => void;
  readonly onKeyDown: (event: KeyEvent) => void;
  readonly onSubmit: () => void;
}

/**
 * Render the active question overlay.
 */
export function QuestionOverlay(props: QuestionOverlayProps) {
  const terminal = useTerminalDimensions();
  return (
    <Show when={props.request !== undefined}>
      <Show
        when={props.contextWindowRequest}
        fallback={
          <box
            position="absolute"
            left={0}
            top={0}
            width={terminal().width}
            height={terminal().height}
            zIndex={2000}
            backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
            alignItems="center"
            paddingTop={Math.floor(terminal().height / 4)}
            focused={props.request !== undefined}
            onKeyDown={props.onKeyDown}
          >
          <box
            width={Math.min(terminal().width - 6, 72)}
            flexDirection="column"
            border
            borderColor={props.theme.brandShimmer}
            backgroundColor={props.theme.inverseText}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
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
                                value={activeAnswer()?.customText ?? ""}
                                flexGrow={1}
                                placeholder="Optional custom answer..."
                                onInput={props.onCustomTextInput}
                                onSubmit={props.onSubmit}
                                onKeyDown={props.onKeyDown}
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
          </box>
        }
      >
        <box
          position="absolute"
          left={0}
          top={0}
          width={terminal().width}
          height={terminal().height}
          zIndex={2000}
          backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
          alignItems="center"
          paddingTop={Math.floor(terminal().height / 4)}
          focused={props.request !== undefined}
          onKeyDown={props.onKeyDown}
        >
        <box
          width={Math.min(terminal().width - 6, 72)}
          flexDirection="column"
          border
          borderColor={props.theme.warning}
          backgroundColor={props.theme.inverseText}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
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
                    <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>Enter saves · ESC closes</text>
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
                      Save the real number if you know it. Otherwise Recode can save a conservative guardrail.
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
                        onSubmit={props.onSubmit}
                        onKeyDown={props.onKeyDown}
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
                    <text fg={props.theme.warning} attributes={TextAttributes.BOLD}>200k Fallback</text>
                    <text fg={props.theme.assistantBody}>
                      Leave the field empty and press Enter to save a 200,000-token window for this model.
                    </text>
                    <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
                      You can change this later with /context-window.
                    </text>
                  </box>
                </>
              );
            }}
          </Show>
        </box>
        </box>
      </Show>
    </Show>
  );
}
