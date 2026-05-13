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

  test("parses ACP server options after the subcommand", () => {
    expect(parseCliArgs([
      "acp-server",
      "--host",
      "127.0.0.1",
      "--port=4321",
      "--token",
      "secret",
      "--provider",
      "openai-main",
      "--model",
      "gpt-test",
      "--approval-mode",
      "auto-edits"
    ])).toEqual({
      command: "acp-server",
      prompt: "",
      acpHost: "127.0.0.1",
      acpPort: 4321,
      acpToken: "secret",
      providerId: "openai-main",
      modelId: "gpt-test",
      approvalMode: "auto-edits",
      persistHistory: true
    });
  });

  test("rejects invalid ACP server port", () => {
    expect(() => parseCliArgs(["acp-server", "--port", "99999"])).toThrow(
      "Invalid ACP server port: 99999. Expected 0-65535."
    );
  });

  test("rejects invalid approval mode", () => {
    expect(() => parseCliArgs(["--approval-mode", "fast", "prompt"])).toThrow(
      "Invalid approval mode: fast. Expected approval, auto-edits, or yolo."
    );
  });
});
