/**
 * Bash tool implementation.
 *
 * @author dev
 */

import { ToolExecutionError } from "../errors/recode-error.ts";
import type { ToolArguments, ToolDefinition, ToolExecutionContext, ToolResult } from "./tool.ts";
import { resolveBashExecutionPolicy } from "./bash-execution-policy.ts";

interface BashToolInput {
  readonly command: string;
}

const MAX_OUTPUT_LENGTH = 12_000;
const DEFAULT_BASH_TIMEOUT_MS = 30_000;

/**
 * Create the Bash tool definition.
 */
export function createBashTool(): ToolDefinition {
  return {
    name: "Bash",
    description: "Execute a shell command inside the current workspace.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute."
        }
      },
      required: ["command"],
      additionalProperties: false
    },
    async execute(arguments_: ToolArguments, context: ToolExecutionContext): Promise<ToolResult> {
      const input = parseBashToolInput(arguments_);
      const executionPolicy = await resolveBashExecutionPolicy();

      const validationError = executionPolicy.validate(input.command, context.workspaceRoot);
      if (validationError !== null) {
        return { content: validationError, isError: true };
      }

      const spawnOptions = { stdout: "pipe" as const, stderr: "pipe" as const, stdin: "ignore" as const };
      const process = executionPolicy.spawn(input.command, context.workspaceRoot, spawnOptions);

      const timeoutHandle = setTimeout(() => {
        process.kill();
      }, DEFAULT_BASH_TIMEOUT_MS);

      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          streamToText(process.stdout),
          streamToText(process.stderr),
          process.exited
        ]);

        const timedOut = exitCode === null || exitCode === 15;
        const content = truncateText(formatProcessResult(stdout, stderr, exitCode, timedOut));

        return {
          content,
          isError: exitCode !== 0 || timedOut
        };
      } finally {
        clearTimeout(timeoutHandle);
      }
    }
  };
}

function parseBashToolInput(arguments_: ToolArguments): BashToolInput {
  const command = arguments_["command"];

  if (typeof command !== "string" || command.trim() === "") {
    throw new ToolExecutionError("Bash tool requires a non-empty 'command' string.");
  }

  return { command };
}

async function streamToText(stream: ReadableStream<Uint8Array> | number | null): Promise<string> {
  if (stream === null || typeof stream === "number") {
    return "";
  }

  return await new Response(stream).text();
}

function formatProcessResult(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  timedOut: boolean
): string {
  const parts: string[] = [];

  if (timedOut) {
    parts.push(`timeout_ms: ${DEFAULT_BASH_TIMEOUT_MS}`);
  }

  parts.push(`exit_code: ${exitCode === null ? "terminated" : String(exitCode)}`);

  if (stdout.trim() !== "") {
    parts.push(`stdout:\n${stdout}`);
  }

  if (stderr.trim() !== "") {
    parts.push(`stderr:\n${stderr}`);
  }

  return parts.join("\n\n");
}

function truncateText(value: string): string {
  if (value.length <= MAX_OUTPUT_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_OUTPUT_LENGTH)}\n\n[truncated]`;
}
