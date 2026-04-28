# Recode Development Guide

## Project Overview

**Recode** is a coding agent built with TypeScript and Bun, with a Senren-inspired TUI terminal interface.

After receiving a user instruction, the agent enters an iterative loop: call the LLM -> parse tool calls -> execute tools -> send results back to the LLM -> repeat until the model stops requesting tools or the maximum iteration count is reached. Streaming output and multi-turn conversation are both supported.

- **Runtime**: Bun
- **Language**: TypeScript (`strict` mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, and `noImplicitOverride`)
- **TUI**: OpenTUI + SolidJS
- **Package manager**: bun

## Meta Rules

- Reply in English
- Determine user intent first, then decide whether to answer, investigate, or implement
- Do only what the user explicitly asked for; do not expand scope on your own
- Search before editing, verify before finishing

## Project Naming

The project name **recode** should be used consistently across the codebase and product surface.

Related imagery is welcome: sacred blades, Hoori, hot spring town atmosphere, shrine maiden motifs, cherry pinks, and warm oranges. Keep it lively, but restrained.

## Technical Constraints

### TypeScript

- `strict` mode, no `any`, no `@ts-ignore`, no `@ts-expect-error`
- Prefer `interface` over `type` unless `type` is required for unions, intersections, or other `type`-only features
- Exported symbols must have JSDoc comments
- File header comment format:

```typescript
/**
 * {module description}
 */
```

### Bun

- Use Bun-native APIs (`Bun.file()`, `Bun.spawn()`, `Bun.Glob`, etc.) and do not add Node polyfills
  - Note: the current `file-tools.ts` and `glob-tool.ts` / `grep-tool.ts` use `node:fs/promises` (`mkdir`, `stat`) and `node:path` (`join`, `relative`, `dirname`), which is acceptable because Bun supports those Node APIs
- Use `bun test` for tests
- Use `bun run` for scripts

### Dependency Management

- Check whether the project already has the needed capability before adding a dependency
- Prefer existing dependencies; update only one major dependency at a time
- Record the reason for introducing a dependency in a commit message or comment
- Current production dependencies: `@opentui/core`, `@opentui/solid`, `solid-js`

## Architecture

### Core Flow

```text
User input
  -> index.ts (CLI entrypoint, argument parsing)
  -> runAgentLoop() (iterative loop)
    -> stream assistant response
    -> parse tool calls
    -> executeToolCall() (tool execution)
    -> append ToolResultMessage to the transcript
    -> repeat until there are no tool calls or maxIterations is reached
```

### Module Responsibilities

| Module | Responsibility | Key Files |
| --- | --- | --- |
| `agent/` | Main agent loop (multi-turn conversation) | `run-agent-loop.ts` |
| `ai/` | Internal AI transport layer | `stream-assistant-response.ts`, `providers/*` |
| `errors/` | Custom error hierarchy | `recode-error.ts` |
| `messages/` | Conversation message model | `message.ts` |
| `models/` | Runtime model factory | `create-model-client.ts` |
| `prompt/` | System prompt | `system-prompt.md` |
| `runtime/` | Environment variable loading | `runtime-config.ts` |
| `shared/` | Shared helpers | `is-record.ts` |
| `tools/` | Tool system | See below |
| `tui/` | OpenTUI + SolidJS UI | `app.tsx`, `logo.tsx`, `spinner.tsx`, `theme.ts`, `output.ts`, `message-format.ts`, `hitokoto.ts`, `run-tui.tsx` |

### Model Client

The runtime model factory creates an internal `AiModel` descriptor:

- `openai` -> OpenAI Responses API
- `openai-chat` -> OpenAI Chat Completions API
- `anthropic` -> Anthropic Messages API

The agent loop streams one assistant turn through the internal AI layer and converts between Recode's internal message model and provider-specific payloads.

### Error Hierarchy

```text
RecodeError (base)
├── ConfigurationError    — runtime configuration error
├── ModelResponseError    — malformed or failed model response
├── ToolExecutionError    — tool execution error
└── PathSecurityError     — workspace path escape
```

## Provider Support

| Provider | `RECODE_PROVIDER` value | Requires API key |
| --- | --- | --- |
| OpenAI Responses API | `openai` (default) | Yes |
| OpenAI Chat Completions API | `openai-chat` | Yes |
| Anthropic Messages API | `anthropic` | Yes |

The `openai` and `openai-chat` providers can target OpenAI-compatible backends by changing `RECODE_BASE_URL` and `RECODE_API_KEY`.

## Tool System

### Structure

```text
ToolDefinition (interface)
  -> ToolRegistry (name index)
  -> executeToolCall() (invocation executor)
  -> createTools() (tool factory)
```

### Tool List

| Tool | Purpose | Source File | Key Details |
| --- | --- | --- | --- |
| `Bash` | Execute shell commands | `src/tools/bash-tool.ts` | `zsh -lc`, 30s timeout, 12KB output cap |
| `Read` | Read files | `src/tools/file-tools.ts` | Limited to 1MB text files |
| `Write` | Write files | `src/tools/file-tools.ts` | Creates parent directories automatically |
| `Edit` | Edit files in place | `src/tools/file-tools.ts` | Exact replacement, target text must be unique |
| `Glob` | Find files by pattern | `src/tools/glob-tool.ts` | Up to 100 results via `Bun.Glob` |
| `Grep` | Search file contents by regex | `src/tools/grep-tool.ts` | Supports `content` and `files_with_matches` output modes; skips binary files |

### Safety Mechanisms

All file operations go through `resolveSafePath()` to ensure they stay inside `workspaceRoot`.

The Bash tool has two layers of sandboxing:
- **Application layer** (`bash-sandbox.ts`): validates command arguments and rejects absolute path escapes, `..` traversal, privilege escalation commands, dangerous environment mutations, and redirects outside the workspace
- **OS layer** (`bwrap-sandbox.ts`): uses `bubblewrap` to isolate the filesystem with `--unshare-all`; automatically falls back to application-layer validation when `bwrap` is unavailable

## Intent Routing

| User wording | Default action |
| --- | --- |
| "explain / analyze / compare / how to" | Research and answer only, no file edits |
| "check / inspect / debug / locate" | Search code, config, and logs first, then report findings |
| "implement / add / modify / fix" | Find existing patterns and boundaries first, then make the smallest viable implementation |
| "refactor / optimize / clean up" | Evaluate benefits, risk, and impact first, then proceed in steps |
| Ambiguous request | Explore first; if still unclear, ask one minimal necessary question |

## Code Style

### Naming

- Files: `kebab-case` (`agent-runner.ts`)
- Classes / interfaces: `PascalCase` (`ToolExecutor`)
- Functions / variables: `camelCase` (`parseCommand`)
- Constants: `UPPER_SNAKE_CASE` (`MAX_RETRIES`)
- Type parameters: `PascalCase`; single letters only for simple generics (`T`, `K`, `V`)
- **Tool internal names**: `PascalCase` (`Bash` / `Read` / `Write` / `Edit` / `Glob` / `Grep`)
- Private fields: `#` prefix (ECMAScript private fields)

### Structure

- One file, one responsibility
- Public APIs should be re-exported through `index.ts` where appropriate
- Use `RecodeError` subclasses for error handling instead of throwing raw strings
- Use `async/await`, not `.then()` chains

### Comments

- Explain **why**, not just **what**
- `TODO` comments must include context (issue number or short explanation)
- Public APIs must have JSDoc comments

### TUI / Visual Direction

- Use the Senren-inspired palette defined in `src/tui/theme.ts`
- The logo component includes the animated Ciallo shimmer effect
- The startup screen fetches a quote from the Hitokoto API
- Tool calls should be displayed in a human-readable form with a concise argument summary, such as `Bash · ls -la` or `Read · src/tui/app.tsx`
- The status bar uses a lantern-style marquee animation

## Execution Protocol

### 1. Understand

Before starting, clarify the goal, constraints, impact area, and validation method.

### 2. Explore

- Find 2-3 similar implementations first to confirm existing patterns
- Read entrypoints, call chains, config, and tests before editing
- The repository is the primary source of truth; do not make confident claims about unread code

### 3. Decide

- Prefer existing implementations, dependencies, and tools
- Prefer boring and reliable solutions
- For changes spanning more than one file, more than one layer, or an unclear scope, provide a brief plan before editing

### 4. Implement

- Work in small, verifiable, reversible steps
- Bug fixes should address the bug itself, not bundle unrelated refactors
- Do not create files, add dependencies, or change public interfaces unless needed

### 5. Verify

- `bun run check` passes
- `bun test` passes
- New features include corresponding tests
- `lsp_diagnostics` has no new errors

### 6. Deliver

Explain what changed, where it changed, how it was verified, and whether any known risks remain.

## Hard Constraints

| Rule | Description |
| --- | --- |
| Type safety | No `any`, `@ts-ignore`, `@ts-expect-error`, or empty `catch` blocks |
| Scope discipline | Do not expand requirements or add extra features on your own |
| Guessing | Do not make certain claims about code, results, or docs you have not read |
| Fake verification | If you did not run the command, test, or inspect the output, do not claim it was verified |
| Retry limit | Try the same problem at most 3 times before stopping and explaining the current state |

## Tests

- Test files should be named `{module}.test.ts` and live beside the source file
- Core logic, edge cases, and failure paths must be covered
- Tests must be independent and self-contained
- Current coverage includes the agent loop, runtime config, file tools, glob tool, grep tool, safe path, bash sandbox, bwrap sandbox, output formatting, and message formatting

## Build

```bash
bun run build      # Build a native binary for the current platform into dist/
bun run build:all  # Build native binaries for Linux/macOS/Windows
```

The build script in `scripts/build.ts` uses `Bun.build()` with `compile` enabled to produce self-contained binaries. It injects `RECODE_VERSION` through `define` during the build.

## Git Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/). Commit messages should be written in English:

```text
type(scope): short summary

optional details
```

Types: `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf`

If the user explicitly asks for a commit, append:

```text
Co-Authored-By: opencode <noreply@opencode.ai>
```

## Definition of Done

- The user-requested scope is fully covered
- Changes match the existing code style
- Type checking / tests / build have passed
- The feature or fix has been actually verified with evidence
