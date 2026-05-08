# Recode

**Recode** is an early-alpha local coding agent built with TypeScript and [Bun](https://bun.sh).

It provides an interactive terminal UI, a one-shot CLI mode, persistent conversation history, configurable model providers, and a custom streaming AI transport layer.

## Features

- TypeScript + Bun with strict compiler settings
- Iterative agent loop with multi-turn tool use
- Interactive TUI mode and one-shot CLI mode
- Internal AI transport layer with native provider presets for OpenAI, Anthropic, Gemini, Groq, AIHubMix, DeepSeek, Z.AI/GLM, and Hugging Face
- Global provider/model config in `~/.recode/config.json`
- Persistent conversation history in `~/.recode/history/`
- Built-in model picker, theme picker, customize popup, approval-mode picker, and history picker
- Paste mode for compact multi-line paste placeholders in the composer
- Session export to standalone HTML
- Built-in tools: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`
- Unsandboxed shell execution with approval prompts, best-effort guardrails, and current-shell-path limitations
- Native binary builds for Linux, macOS, and Windows

## Quick Start

```bash
# Install dependencies
bun install

# Configure environment variables
cp .env.example .env
# Edit .env if you want runtime overrides

# Create or update providers in ~/.recode/config.json
bun run src/index.ts setup

# Start the TUI
bun run start

# Run a single prompt
bun run src/index.ts "show me the project structure"
```

## CLI Usage

```text
recode               Start the interactive TUI
recode setup         Open the provider and model setup wizard
recode <prompt>      Run one prompt and print the final answer
recode -h, --help    Show help
recode -v, --version Show version
```

### Built-in TUI Commands

| Command | Description |
| --- | --- |
| `/help` | Show built-in command help |
| `/clear` | Clear the current session |
| `/status` | Show current session status |
| `/config` | Show current config, theme, provider, model, and approval settings |
| `/models` | Open the model selector |
| `/provider` | Select the active provider or enable/disable saved providers |
| `/theme` | Open the theme selector |
| `/customize` | Open the compact customize popup for theme and tool marker |
| `/approval-mode` | Open the approval-mode selector |
| `/export` | Export the current conversation to HTML |
| `/history` | Open the conversation history |
| `/new` | Start a new conversation |
| `/compact` | Compact older conversation history into a continuation summary |
| `/plan` | Switch to read-only planning mode |
| `/build` | Switch back to normal implementation mode |
| `/layout` | Switch between compact and comfortable layout |
| `/minimal` | Toggle minimal mode (hide header) |
| `/exit` | Exit Recode |
| `/quit` | Exit Recode |

## Config File

Recode stores provider definitions in a user-global config file:

```text
~/.recode/config.json
```

Use `recode setup` to create providers, set base URLs, store model IDs, and choose the active provider.

Each configured provider can define:
- provider ID
- display name
- provider kind (`openai`, `openai-chat`, `anthropic`, `gemini`, `groq`, `aihubmix`, `deepseek`, `z-ai`, `z-ai-coding`, `huggingface`)
- base URL
- optional API key
- optional extra HTTP headers
- optional provider request options
- optional disabled flag, managed from `/provider`
- saved model IDs
- default model ID

Provider request options are JSON values merged into the model request body. They also support Recode transport controls such as `maxRetries`, `timeoutMs`, and `chunkTimeoutMs`; transport-only controls are not sent to the model provider.

For OpenRouter providers, Recode automatically adds low-latency routing, usage reporting, and a conversation prompt-cache key unless you override those fields in provider options.

The global config can also store:
- active provider ID
- active TUI theme
- selected tool marker
- approval mode
- persistent approval allowlist
- layout mode
- minimal mode

## Customize Popup

Use `/customize` to open a compact in-TUI settings popup for quick appearance changes.

It currently supports:
- `Tool Marker`
- `Theme`

Controls:
- `↑` / `↓` choose the row
- `←` / `→` cycle values
- `Space` also cycles the selected row
- `Enter` or `Esc` closes the popup

Changes apply immediately and are persisted to `~/.recode/config.json`.

Available tool markers:
- `→`
- `↳`
- `➜`
- `▸`
- `›`
- `⇢`

Spinner animations are theme-driven and are intentionally not part of `/customize`.

## Sessions And History

Recode stores conversation history globally in:

```text
~/.recode/history/
```

It supports:
- auto-save for each conversation
- restore last session on startup
- saved multi-turn transcripts
- a history picker via `/history`
- starting a fresh conversation via `/new`

Conversations are stored as JSON files plus a global `index.json`.

## TUI Refactor Status

The main TUI screen still centers on [src/tui/app.tsx](./src/tui/app.tsx), but it has been actively reduced and split into smaller modules.

- Current `app.tsx` size: `2987` lines
- Refactor history and extraction map: [src/tui/REFACTOR-HISTORY.md](./src/tui/REFACTOR-HISTORY.md)
- Recent extractions include session persistence, file suggestions, built-in command content, built-in command dispatch, history helpers, shared selector math, layout metrics, popup/overlay components, keyboard routing helpers, prompt submission helpers, interactive prompt workflows, and transcript entry rendering/state

The biggest remaining refactor seams are:
- composer JSX/chrome
- deeper prompt-run orchestration once surrounding state is thinner

## Core Refactor Status

The non-TUI core now has a few opencode-inspired seams:

- `src/agent/run-agent-loop.ts` stays as the public loop API, while `src/agent/session-processor.ts` owns one streamed assistant step, tool execution, synthetic question follow-ups, and doom-loop detection.
- `src/runtime/runtime-config.ts` loads resolved runtime config, while `src/runtime/runtime-provider-config.ts` shapes provider metadata from config plus environment overrides.
- `src/config/recode-config.ts` keeps persistence and parsing, while `src/config/recode-config-update.ts` centralizes config patching so selector helpers do not drop unrelated settings.

## Environment Variables

Recode uses Bun's native `.env` loading. No extra `dotenv` dependency is required. Environment variables are optional runtime overrides on top of `~/.recode/config.json`.

```bash
RECODE_CONFIG_PATH=~/.recode/config.json
RECODE_ACTIVE_PROVIDER=my-provider
RECODE_PROVIDER=openai
RECODE_API_KEY=your-api-key
RECODE_BASE_URL=https://api.openai.com/v1
RECODE_MODEL=your-model-id
RECODE_PROVIDER_HEADERS='{"x-custom":"value"}'
RECODE_PROVIDER_OPTIONS='{"provider":{"sort":"latency"},"maxRetries":2}'
RECODE_AI_TIMING=1
```

When `RECODE_AI_TIMING=1`, provider timing events are written to `~/.recode/ai-timing.jsonl`. Use `RECODE_AI_TIMING=stderr` to print them to stderr instead, or `RECODE_AI_TIMING_PATH=/path/to/file.jsonl` to choose a custom log file.

## Approval Modes

Approval modes are a UX and control feature, not a security sandbox.

Recode supports three tool approval modes:

- `approval`
  - `Read`, `Glob`, and `Grep` run directly
  - `Write`, `Edit`, and `Bash` require approval
- `auto-edits`
  - read and edit tools run directly
  - `Bash` still requires approval
- `yolo`
  - all tools run directly

Use `/approval-mode` in the TUI to switch modes.

When a tool needs approval, Recode opens a popup with:
- allow once
- always allow this scope
- deny

“Always allow” is persisted in the global config allowlist.

## Security Model

Recode runs locally on your machine and can operate on files in your workspace through its tools. The `Bash` tool is intentionally unsandboxed: commands run as a normal child process of Recode with your user permissions.

Current shell support is limited to the execution paths Recode implements today:
- Windows: Git Bash when available, otherwise PowerShell
- Unix-like hosts: `zsh`

Recode does not currently promise generic shell portability across other Unix shells such as `bash` or `sh`.

Approval prompts, approval modes, allowlists, command validation, timeouts, and workspace path checks are guardrails to help you see and control what the agent is doing. They are not designed to provide security isolation and should not be treated as a complete security boundary.

If you need real isolation, run Recode inside a container, VM, disposable workspace, or another environment you are comfortable letting an agent control.

## Themes And Loaders

Themes affect more than static colors. Recode also ties several visual details to the active theme:
- prompt marker
- tool marker defaults if you do not override them
- loading spinner / busy animation style

The current loading animations are theme-specific, so different themes can feel distinct without requiring a separate spinner picker.

## Paste Mode

When you paste multi-line content into the main composer, Recode compacts it into a visible placeholder such as:

```text
{Paste 11 lines #1}
```

The full pasted text is still expanded before the prompt is sent to the model, so the UI stays compact without losing content.

## Export

Use `/export` to save the current conversation as a standalone HTML file. By default, Recode writes the export into the current workspace root with a name like:

```text
recode-export-<conversation-title>-<timestamp>.html
```

The export includes:
- conversation title
- provider and model metadata
- full transcript
- the currently selected Recode theme colors

### Providers

Supported values for `RECODE_PROVIDER`:

- `openai` -> OpenAI Responses API
- `openai-chat` -> OpenAI Chat Completions API
- `anthropic` -> Anthropic Messages API
- `gemini` -> Google AI Studio / Gemini OpenAI-compatible Chat Completions API
- `groq` -> Groq OpenAI-compatible Chat Completions API
- `aihubmix` -> AIHubMix OpenAI-compatible gateway
- `deepseek` -> DeepSeek OpenAI-compatible Chat Completions API
- `z-ai` -> Z.AI / GLM general OpenAI-compatible Chat Completions API
- `z-ai-coding` -> Z.AI / GLM Coding Plan endpoint
- `huggingface` -> Hugging Face Inference Providers OpenAI-compatible router

### OpenAI-Compatible Backends

For generic OpenAI-compatible services, use `openai-chat` and point `RECODE_BASE_URL` at that service. For the native providers listed above, Recode already knows the default base URL, so env-only config usually needs only `RECODE_PROVIDER`, `RECODE_API_KEY`, and `RECODE_MODEL`.

Examples:

```bash
# OpenAI Responses
RECODE_PROVIDER=openai
RECODE_API_KEY=sk-...
RECODE_BASE_URL=https://api.openai.com/v1
RECODE_MODEL=gpt-4.1

# OpenAI-compatible chat backend
RECODE_PROVIDER=openai-chat
RECODE_BASE_URL=http://127.0.0.1:11434/v1
RECODE_MODEL=qwen3:8b

# Anthropic
RECODE_PROVIDER=anthropic
RECODE_API_KEY=sk-ant-...
RECODE_BASE_URL=https://api.anthropic.com/v1
RECODE_MODEL=claude-sonnet-4-20250514

# Gemini / Google AI Studio
RECODE_PROVIDER=gemini
RECODE_API_KEY=...
RECODE_MODEL=gemini-2.5-flash

# Groq
RECODE_PROVIDER=groq
RECODE_API_KEY=gsk_...
RECODE_MODEL=your-groq-model-id

# DeepSeek
RECODE_PROVIDER=deepseek
RECODE_API_KEY=sk-...
RECODE_MODEL=deepseek-v4-flash

# AIHubMix
RECODE_PROVIDER=aihubmix
RECODE_API_KEY=sk-...
RECODE_MODEL=gpt-4o-mini

# Z.AI GLM Coding Plan
RECODE_PROVIDER=z-ai-coding
RECODE_API_KEY=...
RECODE_MODEL=glm-5

# Hugging Face Inference Providers
RECODE_PROVIDER=huggingface
RECODE_API_KEY=hf_...
RECODE_MODEL=Qwen/Qwen3-Coder-480B-A35B-Instruct
```

## Tool System

| Tool | Purpose | Notes |
| --- | --- | --- |
| `Bash` | Run shell commands | Unsandboxed child process; 30s timeout, 12KB output cap, approval + best-effort validation guardrails; currently uses Git Bash or PowerShell on Windows and `zsh` on Unix-like hosts |
| `Read` | Read files | Limited to text files up to 1MB |
| `Write` | Write files | Creates parent directories automatically |
| `Edit` | Replace one unique text fragment | Fails if the target is missing or not unique |
| `Glob` | Find files by glob pattern | Up to 100 results |
| `Grep` | Search file contents by regex | Supports content mode and files-with-matches mode |

Direct file tools are constrained to the workspace root through safe path resolution. `Bash` is different: it is unsandboxed shell execution, so its approval prompts and validation checks should be treated as guardrails, not isolation. It is also tied to the currently implemented shell paths rather than being portable across every user shell.

## Project Layout

```text
recode/
├── src/
│   ├── agent/       # Agent loop
│   ├── ai/          # Internal AI transport layer
│   ├── config/      # Persistent user config and config update helpers
│   ├── errors/      # Error types
│   ├── history/     # Persistent sessions and HTML export
│   ├── models/      # Runtime model factory
│   ├── prompt/      # System prompt
│   ├── runtime/     # Runtime config loading and provider metadata shaping
│   ├── shared/      # Shared helpers
│   ├── tools/       # Tool system
│   ├── transcript/  # Conversation transcript model
│   ├── tui/         # OpenTUI UI
│   └── index.ts     # CLI entrypoint
├── scripts/
│   └── build.ts     # Native build script
├── .env.example
├── ~/.recode/       # Global config and history storage
├── AGENTS.md
├── bunfig.toml
├── package.json
├── tsconfig.json
└── README.md
```

## Available Scripts

```bash
bun run start      # Start the TUI
bun run check      # Run TypeScript type checking
bun run test       # Run this project's test suite
bun run build      # Build a native binary for the current platform
bun run build:all  # Build native binaries for all supported platforms
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript |
| TUI | [OpenTUI](https://opentui.dev) + SolidJS |
| Package manager | bun |
| Build output | Native Bun-compiled binaries |

## License

[GPLv3](LICENSE)
