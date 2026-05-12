/**
 * Command-panel state helpers for slash-command drafts.
 */

import { normalizeBuiltinCommandSelectionIndex } from "../message-format.ts";
import type { CommandPanelState } from "../keyboard-router.ts";

/** Build the visible slash-command panel state for the composer. */
export function buildCommandPanelState(
  draft: string,
  commands: readonly { readonly command: string; readonly description: string }[],
  busy: boolean,
  selectedIndex: number
): CommandPanelState | undefined {
  const prompt = draft.trim();

  if (busy || !prompt.startsWith("/")) {
    return undefined;
  }

  const visibleCommands = commands;
  const normalizedSelectedIndex = normalizeBuiltinCommandSelectionIndex(selectedIndex, visibleCommands.length);

  return {
    commands: visibleCommands,
    hasMore: false,
    selectedIndex: normalizedSelectedIndex,
    selectedCommand: visibleCommands[normalizedSelectedIndex]
  };
}
