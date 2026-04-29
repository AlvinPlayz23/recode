/**
 * TUI message formatting tests.
 *
 * @author dev
 */

import { describe, expect, it } from "bun:test";
import {
  findBuiltinCommands,
  getBuiltinCommands,
  isExitCommand,
  moveBuiltinCommandSelectionIndex,
  normalizeBuiltinCommandSelectionIndex,
  parseBuiltinCommand,
  titledRule,
  toDisplayLines
} from "./message-format.ts";

describe("tui message format", () => {
  it("recognizes exit commands", () => {
    expect(isExitCommand("/exit")).toBe(true);
    expect(isExitCommand(" /quit ")).toBe(true);
    expect(isExitCommand("hello")).toBe(false);
  });

  it("parses builtin commands", () => {
    expect(parseBuiltinCommand(" /help ")).toEqual({ name: "help", raw: "/help" });
    expect(parseBuiltinCommand("/status")).toEqual({ name: "status", raw: "/status" });
    expect(parseBuiltinCommand("/config")).toEqual({ name: "config", raw: "/config" });
    expect(parseBuiltinCommand("/models")).toEqual({ name: "models", raw: "/models" });
    expect(parseBuiltinCommand("/theme")).toEqual({ name: "theme", raw: "/theme" });
    expect(parseBuiltinCommand("/customize")).toEqual({ name: "customize", raw: "/customize" });
    expect(parseBuiltinCommand("/approval-mode")).toEqual({ name: "approval-mode", raw: "/approval-mode" });
    expect(parseBuiltinCommand("/export")).toEqual({ name: "export", raw: "/export" });
    expect(parseBuiltinCommand("/history")).toEqual({ name: "history", raw: "/history" });
    expect(parseBuiltinCommand("/new")).toEqual({ name: "new", raw: "/new" });
    expect(parseBuiltinCommand("/layout")).toEqual({ name: "layout", raw: "/layout" });
    expect(parseBuiltinCommand("/minimal")).toEqual({ name: "minimal", raw: "/minimal" });
    expect(parseBuiltinCommand("hello")).toBeUndefined();
  });

  it("lists builtin commands", () => {
    expect(getBuiltinCommands()).toEqual([
      { name: "help", command: "/help", description: "Show built-in command help" },
      { name: "clear", command: "/clear", description: "Clear the current session" },
      { name: "status", command: "/status", description: "Show the current session status" },
      { name: "config", command: "/config", description: "Show the current Recode configuration" },
      { name: "models", command: "/models", description: "Open the model selector" },
      { name: "theme", command: "/theme", description: "Open the theme selector" },
      { name: "customize", command: "/customize", description: "Customize theme and tool marker" },
      { name: "approval-mode", command: "/approval-mode", description: "Open the approval mode selector" },
      { name: "export", command: "/export", description: "Export the current conversation to HTML" },
      { name: "history", command: "/history", description: "Open the conversation history" },
      { name: "new", command: "/new", description: "Start a new conversation" },
      { name: "layout", command: "/layout", description: "Switch between compact and comfortable layout" },
      { name: "minimal", command: "/minimal", description: "Toggle minimal mode (hide header)" },
      { name: "exit", command: "/exit", description: "Exit Recode" },
      { name: "quit", command: "/quit", description: "Exit Recode" }
    ]);
  });

  it("finds builtin command suggestions by prefix", () => {
    expect(findBuiltinCommands("/").map((command) => command.command)).toEqual([
      "/help",
      "/clear",
      "/status",
      "/config",
      "/models",
      "/theme",
      "/customize",
      "/approval-mode",
      "/export",
      "/history",
      "/new",
      "/layout",
      "/minimal",
      "/exit",
      "/quit"
    ]);
    expect(findBuiltinCommands("/st")).toEqual([
      { name: "status", command: "/status", description: "Show the current session status" }
    ]);
    expect(findBuiltinCommands("hello")).toEqual([]);
  });

  it("normalizes command selection index", () => {
    expect(normalizeBuiltinCommandSelectionIndex(-1, 5)).toBe(0);
    expect(normalizeBuiltinCommandSelectionIndex(99, 3)).toBe(2);
    expect(normalizeBuiltinCommandSelectionIndex(1, 3)).toBe(1);
    expect(normalizeBuiltinCommandSelectionIndex(1, 0)).toBe(0);
  });

  it("moves command selection index cyclically", () => {
    expect(moveBuiltinCommandSelectionIndex(0, 3, -1)).toBe(2);
    expect(moveBuiltinCommandSelectionIndex(2, 3, 1)).toBe(0);
    expect(moveBuiltinCommandSelectionIndex(1, 3, 1)).toBe(2);
    expect(moveBuiltinCommandSelectionIndex(0, 0, 1)).toBe(0);
  });

  it("splits content into display lines", () => {
    expect(toDisplayLines("a\nb")).toEqual(["a", "b"]);
    expect(toDisplayLines("a\r\nb")).toEqual(["a", "b"]);
  });

  it("creates a titled divider rule", () => {
    const rule = titledRule(20, "chat");

    expect(rule).toContain(" chat ");
    expect(rule.length).toBe(20);
  });
});
