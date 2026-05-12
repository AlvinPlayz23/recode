/**
 * Tests for CLI argument parsing.
 */

import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "./args.ts";

describe("parseCliArgs", () => {
  test("defaults to TUI mode with history enabled", () => {
    expect(parseCliArgs([])).toEqual({
      command: "tui",
      prompt: "",
      persistHistory: true
    });
  });

  test("parses one-shot options before prompt text", () => {
    expect(parseCliArgs([
      "--provider",
      "openai-main",
      "--model=gpt-test",
      "--approval-mode",
      "yolo",
      "--no-history",
      "summarize",
      "this"
    ])).toEqual({
      command: "prompt",
      prompt: "summarize this",
      providerId: "openai-main",
      modelId: "gpt-test",
      approvalMode: "yolo",
      persistHistory: false
    });
  });

  test("keeps flags after prompt start as prompt text", () => {
    expect(parseCliArgs(["explain", "--help"])).toEqual({
      command: "prompt",
      prompt: "explain --help",
      persistHistory: true
    });
  });

  test("supports explicit prompt separator", () => {
    expect(parseCliArgs(["--", "--help"])).toEqual({
      command: "prompt",
      prompt: "--help",
      persistHistory: true
    });
  });

  test("parses command words only when they are the whole command", () => {
    expect(parseCliArgs(["doctor"])).toMatchObject({ command: "doctor" });
    expect(parseCliArgs(["doctor", "why"])).toMatchObject({
      command: "prompt",
      prompt: "doctor why"
    });
  });

  test("rejects invalid approval mode", () => {
    expect(() => parseCliArgs(["--approval-mode", "fast", "prompt"])).toThrow(
      "Invalid approval mode: fast. Expected approval, auto-edits, or yolo."
    );
  });
});
