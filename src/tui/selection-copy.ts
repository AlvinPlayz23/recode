/**
 * Selection-to-clipboard behavior for the TUI.
 */

import { useSelectionHandler } from "@opentui/solid";
import { writeClipboardText } from "./composer/prompt-renderable.ts";

/** Register OSC 52 copy-on-selection behavior. */
export function registerSelectionCopyHandler(showToast: (message: string) => void): void {
  let lastCopiedSelectionText = "";

  useSelectionHandler((selection) => {
    if (selection.isDragging) {
      return;
    }

    const selectedText = selection.getSelectedText();

    if (selectedText === "") {
      lastCopiedSelectionText = "";
      return;
    }

    if (selectedText === lastCopiedSelectionText) {
      return;
    }

    writeClipboardText(selectedText);
    showToast("Copied text");
    lastCopiedSelectionText = selectedText;
  });
}
