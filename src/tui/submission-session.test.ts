/**
 * Tests for prompt submission/session helpers.
 */

import { describe, expect, it } from "bun:test";
import {
  createEntry,
  type UiEntry
} from "./transcript-entry-state.ts";
import {
  appendToolCallEntryAndCreateAssistantPlaceholder,
  finalizeAssistantStreamEntry
} from "./submission-session.ts";

describe("submission session helpers", () => {
  it("replaces an empty assistant placeholder with a tool call entry", () => {
    let entries: readonly UiEntry[] = [createEntry("assistant", "Recode", "")];
    const currentId = entries[0]?.id;

    const nextEntry = appendToolCallEntryAndCreateAssistantPlaceholder({
      currentStreamingId: currentId,
      currentStreamingBody: "",
      toolCall: {
        id: "call_1",
        name: "Bash",
        argumentsJson: "{\"command\":\"ls -la\"}"
      },
      setEntries(setter) {
        entries = setter(entries);
      }
    });

    expect(nextEntry?.kind).toBe("assistant");
    expect(entries.map((entry) => [entry.kind, entry.body])).toEqual([
      ["tool", "Bash · ls -la"],
      ["assistant", ""]
    ]);
  });

  it("finalizes the last assistant placeholder with final text", () => {
    let entries: readonly UiEntry[] = [createEntry("assistant", "Recode", "")];
    const entryId = entries[0]?.id;

    finalizeAssistantStreamEntry((setter) => {
      entries = setter(entries);
    }, entryId, "done");

    expect(entries[0]?.body).toBe("done");
  });
});
