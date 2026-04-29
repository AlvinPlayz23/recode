/**
 * Tests for HTML conversation export.
 *
 * @author dev
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exportConversationToHtml } from "./export-html.ts";
import type { SavedConversationRecord } from "./recode-history.ts";

describe("exportConversationToHtml", () => {
  it("writes a standalone HTML transcript", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "recode-export-"));
    const conversation: SavedConversationRecord = {
      id: "conversation-1",
      title: "Architecture Review",
      preview: "Looks good.",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
      providerId: "openai",
      providerName: "OpenAI",
      model: "gpt-4.1",
      mode: "build",
      messageCount: 2,
      transcript: [
        { role: "user", content: "Explain the architecture." },
        {
          role: "assistant",
          content: "Here is the architecture.",
          toolCalls: []
        }
      ]
    };

    const outputPath = exportConversationToHtml({
      workspaceRoot,
      conversation,
      themeName: "senren-dusk"
    });
    const html = readFileSync(outputPath, "utf8");

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Architecture Review");
    expect(html).toContain("Explain the architecture.");
    expect(html).toContain("Here is the architecture.");
    expect(outputPath).toContain("recode-export-architecture-review");
  });
});
