/**
 * Helpers for synchronizing OpenTUI prompt renderables with draft state.
 */

import { InputRenderable, type TextareaRenderable } from "@opentui/core";
import { toVisibleDraft } from "./prompt-draft.ts";

/** Prompt input renderable variants used by the composer. */
export type PromptRenderable = InputRenderable | TextareaRenderable;

/** Read plain text from a prompt renderable. */
export function getRenderableText(input: PromptRenderable | undefined): string {
  return input?.plainText ?? "";
}

/** Replace the visible text in a prompt renderable. */
export function setRenderableText(input: PromptRenderable | undefined, value: string): void {
  if (input === undefined) {
    return;
  }

  if (input instanceof InputRenderable) {
    input.value = value;
  } else {
    input.editBuffer.setText(value);
    input.cursorOffset = value.length;
  }
}

/** Keep command drafts ergonomic by moving the cursor to the end. */
export function moveRenderableCursorToEnd(input: PromptRenderable | undefined, value: string): void {
  if (input === undefined) {
    return;
  }

  input.cursorOffset = value.length;
}

/** Apply the theme-specific prompt cursor style to an OpenTUI input. */
export function applyInputCursorStyle(input: PromptRenderable | undefined, color: string): void {
  if (input === undefined) {
    return;
  }

  input.cursorStyle = {
    style: "line",
    blinking: false
  };
  input.cursorColor = color;
}

/** Clear the visible prompt and the backing draft state. */
export function clearDraft(
  input: PromptRenderable | undefined,
  setDraft: (value: string) => void
): void {
  setRenderableText(input, "");
  setDraft("");
}

/** Apply a slash-command draft and focus the prompt. */
export function applyCommandDraft(
  input: PromptRenderable | undefined,
  setDraft: (value: string) => void,
  setCommandSelectionIndex: (value: number) => void,
  command: string
): void {
  if (input !== undefined) {
    setRenderableText(input, toVisibleDraft(command));
    input.focus();
  }

  setDraft(command);
  setCommandSelectionIndex(0);
}

/** Copy selected terminal text through OSC 52. */
export function writeClipboardText(text: string): void {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  process.stdout.write(`\u001B]52;c;${encoded}\u0007`);
}
