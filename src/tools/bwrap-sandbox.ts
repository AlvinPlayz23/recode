/**
 * bubblewrap (`bwrap`) sandbox integration.
 *
 * When `bwrap` is available, Bash subprocesses run inside an isolated sandbox.
 * Otherwise execution falls back to direct process spawning.
 *
 * @author dev
 */

import { existsSync } from "node:fs";

/**
 * Child process spawn options.
 */
interface SpawnOptions {
  readonly stdout: "pipe";
  readonly stderr: "pipe";
  readonly stdin: "ignore";
}

/** Cached `bwrap` availability: `undefined` = unchecked, `true`/`false` = checked. */
let bwrapAvailable: boolean | undefined;

/** Minimal set of environment variable names forwarded into the sandbox. */
const MINIMAL_ENV_KEYS = ["HOME", "PATH", "TMPDIR", "LANG", "TERM"] as const;

/** System directories mounted read-only inside the sandbox. */
const READONLY_BIND_DIRS = ["/usr", "/bin", "/lib", "/lib64", "/etc"] as const;

/**
 * Check whether `bwrap` is available.
 *
 * The result is cached and checked at most once per process.
 */
export async function isBubblewrapAvailable(): Promise<boolean> {
  if (bwrapAvailable !== undefined) {
    return bwrapAvailable;
  }

  try {
    const proc = Bun.spawn({
      cmd: ["bwrap", "--version"],
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe"
    });
    const exitCode = await proc.exited;
    bwrapAvailable = exitCode === 0;
    return bwrapAvailable;
  } catch (_error: unknown) {
    bwrapAvailable = false;
    return false;
  }
}

/**
 * Spawn a child process directly without sandboxing.
 */
export function spawnDirect(
  command: string,
  workspaceRoot: string,
  options: SpawnOptions
): Bun.Subprocess<"ignore", "pipe", "pipe"> {
  return Bun.spawn({
    cmd: getShellCommand(command),
    cwd: workspaceRoot,
    stdin: options.stdin,
    stdout: options.stdout,
    stderr: options.stderr
  });
}

/**
 * Spawn a child process inside a `bwrap` sandbox.
 *
 * Sandbox policy:
 * - `--unshare-all` isolates all namespaces
 * - system directories (`/usr`, `/bin`, `/lib`, `/lib64`, `/etc`) are mounted read-only
 * - the workspace is mounted read-write
 * - `/tmp` uses sandbox-local tmpfs
 * - `/proc` and `/dev` are mounted for common command support
 * - only a minimal environment plus `RECODE_*` variables is forwarded
 */
export function spawnSandboxed(
  command: string,
  workspaceRoot: string,
  options: SpawnOptions
): Bun.Subprocess<"ignore", "pipe", "pipe"> {
  const args = buildBwrapArgs(command, workspaceRoot);
  return Bun.spawn({
    cmd: args,
    cwd: workspaceRoot,
    stdin: options.stdin,
    stdout: options.stdout,
    stderr: options.stderr
  });
}

/**
 * Build the `bwrap` command argument list.
 */
function buildBwrapArgs(command: string, workspaceRoot: string): string[] {
  const args: string[] = [
    "bwrap",
    "--unshare-all",
    "--new-session",
    "--die-with-parent",
    "--clearenv",
    "--proc",
    "/proc",
    "--dev",
    "/dev"
  ];

  for (const dir of READONLY_BIND_DIRS) {
    if (existsSync(dir)) {
      args.push("--ro-bind", dir, dir);
    }
  }

  args.push("--tmpfs", "/tmp");
  args.push("--bind", workspaceRoot, workspaceRoot);

  const envVars = collectMinimalEnv();
  for (const [key, value] of Object.entries(envVars)) {
    args.push("--setenv", key, value);
  }

  args.push(...getShellCommand(command));
  return args;
}

/**
 * Collect the minimal environment variable set passed into the sandbox.
 */
function collectMinimalEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of MINIMAL_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("RECODE_") && value !== undefined && value !== "") {
      env[key] = value;
    }
  }

  return env;
}

function getShellCommand(command: string): string[] {
  if (process.platform === "win32") {
    return ["powershell", "-Command", command];
  }

  return ["zsh", "-lc", command];
}

export type { SpawnOptions };
