/**
 * CLI argument parsing for Recode.
 */

import type { ApprovalMode } from "../tools/tool.ts";

/** Parsed CLI invocation shape. */
export interface ParsedCliArgs {
  readonly command: "help" | "version" | "setup" | "doctor" | "tui" | "prompt";
  readonly prompt: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly approvalMode?: ApprovalMode;
  readonly persistHistory: boolean;
}

/**
 * Parse global options, subcommands, and prompt text.
 */
export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const options = parseOptions(argv);
  const command = resolveCommand(options.remaining);
  const prompt = command === "prompt" ? options.remaining.join(" ").trim() : "";

  return {
    command,
    prompt,
    persistHistory: !options.noHistory,
    ...(options.providerId === undefined ? {} : { providerId: options.providerId }),
    ...(options.modelId === undefined ? {} : { modelId: options.modelId }),
    ...(options.approvalMode === undefined ? {} : { approvalMode: options.approvalMode })
  };
}

interface ParsedOptions {
  readonly remaining: readonly string[];
  readonly providerId?: string;
  readonly modelId?: string;
  readonly approvalMode?: ApprovalMode;
  readonly noHistory: boolean;
}

function parseOptions(argv: readonly string[]): ParsedOptions {
  const remaining: string[] = [];
  let providerId: string | undefined;
  let modelId: string | undefined;
  let approvalMode: ApprovalMode | undefined;
  let noHistory = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--") {
      remaining.push(...argv.slice(index + 1));
      break;
    }

    if (token === "-h" || token === "--help") {
      return { remaining: ["help"], noHistory };
    }

    if (token === "-v" || token === "--version") {
      return { remaining: ["version"], noHistory };
    }

    if (token === "--no-history") {
      noHistory = true;
      continue;
    }

    const providerValue = readOptionValue(argv, index, token, "--provider");
    if (providerValue.matched) {
      providerId = providerValue.value;
      index += providerValue.consumedNext ? 1 : 0;
      continue;
    }

    const modelValue = readOptionValue(argv, index, token, "--model");
    if (modelValue.matched) {
      modelId = modelValue.value;
      index += modelValue.consumedNext ? 1 : 0;
      continue;
    }

    const approvalValue = readOptionValue(argv, index, token, "--approval-mode");
    if (approvalValue.matched) {
      approvalMode = parseApprovalMode(approvalValue.value);
      index += approvalValue.consumedNext ? 1 : 0;
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }

    remaining.push(...argv.slice(index));
    break;
  }

  return {
    remaining,
    noHistory,
    ...(providerId === undefined ? {} : { providerId }),
    ...(modelId === undefined ? {} : { modelId }),
    ...(approvalMode === undefined ? {} : { approvalMode })
  };
}

interface OptionValue {
  readonly matched: boolean;
  readonly value: string;
  readonly consumedNext: boolean;
}

function readOptionValue(
  argv: readonly string[],
  index: number,
  token: string,
  optionName: string
): OptionValue {
  if (token === optionName) {
    const value = argv[index + 1]?.trim();
    if (value === undefined || value === "") {
      throw new Error(`Missing value for ${optionName}.`);
    }

    return { matched: true, value, consumedNext: true };
  }

  const prefix = `${optionName}=`;
  if (token.startsWith(prefix)) {
    const value = token.slice(prefix.length).trim();
    if (value === "") {
      throw new Error(`Missing value for ${optionName}.`);
    }

    return { matched: true, value, consumedNext: false };
  }

  return { matched: false, value: "", consumedNext: false };
}

function parseApprovalMode(value: string): ApprovalMode {
  if (value === "approval" || value === "auto-edits" || value === "yolo") {
    return value;
  }

  throw new Error(`Invalid approval mode: ${value}. Expected approval, auto-edits, or yolo.`);
}

function resolveCommand(remaining: readonly string[]): ParsedCliArgs["command"] {
  const first = remaining[0];
  if (first === undefined) {
    return "tui";
  }

  switch (first) {
    case "help":
      return "help";
    case "version":
      return "version";
    case "setup":
      return remaining.length === 1 ? "setup" : "prompt";
    case "doctor":
      return remaining.length === 1 ? "doctor" : "prompt";
    default:
      return "prompt";
  }
}
