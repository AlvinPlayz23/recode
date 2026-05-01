/**
 * Tests for TUI keyboard routing helpers.
 */

import { describe, expect, it } from "bun:test";
import {
  handleCommandPanelKey,
  handleFileSuggestionPanelKey,
  handleQuestionRequestKey,
  handleLinearPickerKey,
  type TuiKeyEvent
} from "./keyboard-router.ts";

describe("keyboard router helpers", () => {
  it("moves a linear picker and consumes handled navigation keys", () => {
    const key = createKey("down");
    let moved: -1 | 1 | undefined;

    const handled = handleLinearPickerKey({
      key,
      open: true,
      totalCount: 3,
      close() {
        throw new Error("should not close");
      },
      move(direction) {
        moved = direction;
      },
      submit() {
        throw new Error("should not submit");
      }
    });

    expect(handled).toBe(true);
    expect(key.prevented).toBe(true);
    expect(moved).toBe(1);
  });

  it("applies the selected file suggestion back into the draft", () => {
    const key = createKey("tab");
    let draft = "@sr";
    let rendered = "";
    let selectionIndex = 3;
    let focused = false;

    const handled = handleFileSuggestionPanelKey({
      key,
      panel: {
        items: [{
          displayPath: "src/app.tsx",
          directory: false
        }],
        hasMore: false,
        selectedIndex: 0,
        selectedItem: {
          displayPath: "src/app.tsx",
          directory: false
        }
      },
      currentDraft: draft,
      setDraft(value) {
        draft = value;
      },
      setSelectionIndex(value) {
        selectionIndex = value;
      },
      setRenderableDraft(value) {
        rendered = value;
      },
      focusPrompt() {
        focused = true;
      }
    });

    expect(handled).toBe(true);
    expect(key.prevented).toBe(true);
    expect(draft).toBe("@src/app.tsx ");
    expect(rendered).toBe("@src/app.tsx ");
    expect(selectionIndex).toBe(0);
    expect(focused).toBe(true);
  });

  it("submits the active slash command on enter", () => {
    const key = createKey("enter");
    let submitted = "";

    const handled = handleCommandPanelKey({
      key,
      panel: {
        commands: [{ command: "/history", description: "Open history" }],
        hasMore: false,
        selectedIndex: 0,
        selectedCommand: { command: "/history", description: "Open history" }
      },
      clearDraft() {
        throw new Error("should not clear");
      },
      setSelectionIndex() {
        throw new Error("should not move");
      },
      applyCommand() {
        throw new Error("should not apply");
      },
      submitCommand(command) {
        submitted = command;
      },
      focusPrompt() {
        return;
      }
    });

    expect(handled).toBe(true);
    expect(key.prevented).toBe(true);
    expect(key.stopped).toBe(true);
    expect(submitted).toBe("/history");
  });

  it("consumes enter while submitting an active question prompt", () => {
    const key = createKey("enter");
    let submitted = false;

    const handled = handleQuestionRequestKey({
      key,
      request: {
        questions: [{
          id: "choice",
          header: "Choice",
          question: "Pick one",
          multiSelect: false,
          allowCustomText: false,
          options: [{ label: "Yes", description: "Confirm" }]
        }],
        currentQuestionIndex: 0,
        selectedOptionIndex: 0,
        answers: {
          choice: {
            questionId: "choice",
            selectedOptionLabels: ["Yes"],
            customText: ""
          }
        },
        resolve() {
          throw new Error("should not resolve directly");
        }
      },
      contextWindowRequest: false,
      dismiss() {
        throw new Error("should not dismiss");
      },
      submit() {
        submitted = true;
      },
      moveQuestion() {
        throw new Error("should not move question");
      },
      moveOption() {
        throw new Error("should not move option");
      },
      toggleOption() {
        throw new Error("should not toggle");
      }
    });

    expect(handled).toBe(true);
    expect(key.prevented).toBe(true);
    expect(key.stopped).toBe(true);
    expect(submitted).toBe(true);
  });
});

function createKey(name: string): TuiKeyEvent & { prevented: boolean; stopped: boolean } {
  return {
    name,
    ctrl: false,
    shift: false,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    }
  };
}
