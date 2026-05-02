/**
 * Bash execution policy selection.
 */

import { validateCommand } from "./bash-sandbox.ts";
import {
  spawnDirect,
  type SpawnOptions
} from "./bwrap-sandbox.ts";

/**
 * Bash execution isolation mode.
 */
export type BashExecutionIsolation = "bubblewrap" | "guarded-direct";

/**
 * Resolved Bash execution policy.
 */
export interface BashExecutionPolicy {
  readonly isolation: BashExecutionIsolation;
  readonly validate: (command: string, workspaceRoot: string) => string | null;
  readonly spawn: (
    command: string,
    workspaceRoot: string,
    options: SpawnOptions
  ) => Bun.Subprocess<"ignore", "pipe", "pipe">;
}

/**
 * Resolve the safest available Bash execution policy for this host.
 */
export async function resolveBashExecutionPolicy(): Promise<BashExecutionPolicy> {
  // TODO: Re-enable OS-level sandboxing once the bwrap path is redesigned and
  // tested across Windows/macOS/Linux. It currently causes tool hangs on some
  // hosts, so Bash temporarily uses guarded direct execution instead.
  return {
    isolation: "guarded-direct",
    validate(command, workspaceRoot) {
      return validateCommandForGuardedDirectExecution(command, workspaceRoot);
    },
    spawn: spawnDirect
  };
}

/**
 * Validate a command for direct execution when no OS sandbox is available.
 */
export function validateCommandForGuardedDirectExecution(command: string, workspaceRoot: string): string | null {
  const validationError = validateCommand(command, workspaceRoot);
  if (validationError !== null) {
    return validationError;
  }

  if (usesUnsupportedShellExpansion(command)) {
    return "Shell expansions and command substitution are not allowed when bubblewrap sandboxing is unavailable.";
  }

  return null;
}

function usesUnsupportedShellExpansion(command: string): boolean {
  return command.includes("$(")
    || command.includes("${")
    || command.includes("`");
}
