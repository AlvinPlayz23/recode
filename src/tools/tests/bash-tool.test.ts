/**
 * Tests for the Bash tool execution wrapper.
 */

import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBashTool } from "../bash-tool.ts";

describe("Bash tool", () => {
  it("returns immediately when the request is already aborted", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "recode-bash-abort-"));
    const abortController = new AbortController();
    const tool = createBashTool();
    abortController.abort();

    try {
      const result = await tool.execute(
        { command: "echo should-not-run" },
        {
          workspaceRoot,
          approvalMode: "yolo",
          abortSignal: abortController.signal
        }
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain("aborted");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
