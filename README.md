# Recode

**Recode** is a coding agent built with TypeScript and [Bun](https://bun.sh), with a Senren-inspired TUI terminal interface.

The project keeps a light Senren-inspired aesthetic in the UI, but the focus is still a practical local coding agent CLI.

> Warning: this project is still in an early stage. Do not use it in production. The shell sandbox is useful, but it should not be treated as a complete security boundary.

## Features

- TypeScript + Bun with strict compiler settings
- Iterative agent loop with multi-turn tool use
- Interactive TUI mode and one-shot CLI mode
- Internal AI transport layer with support for OpenAI Responses, OpenAI Chat Completions, and Anthropic Messages
- Global provider/model config in `~/.recode/config.json`
- Persistent conversation history in `~/.recode/history/`
- Built-in model picker, theme picker, customize popup, approval-mode picker, and history picker
- Paste mode for compact multi-line paste placeholders in the composer
- Session export to standalone HTML
- Built-in tools: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`
- Shell safety checks plus optional `bubblewrap` isolation
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
- provider kind (`openai`, `openai-chat`, `anthropic`)
- base URL
- optional API key
- saved model IDs
- default model ID

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

- Current `app.tsx` size: `3497` lines
- Refactor history and extraction map: [src/tui/REFACTOR-HISTORY.md](./src/tui/REFACTOR-HISTORY.md)
- Recent extractions include session persistence, file suggestions, built-in command content, history helpers, shared selector math, and the major popup/overlay components

The biggest remaining refactor seams are:
- keyboard routing
- prompt submission and agent orchestration
- transcript rehydration and entry rendering
- layout/composer measurement helpers

## Environment Variables

Recode uses Bun's native `.env` loading. No extra `dotenv` dependency is required. Environment variables are optional runtime overrides on top of `~/.recode/config.json`.

```bash
RECODE_CONFIG_PATH=~/.recode/config.json
RECODE_ACTIVE_PROVIDER=my-provider
RECODE_PROVIDER=openai
RECODE_API_KEY=your-api-key
RECODE_BASE_URL=https://api.openai.com/v1
RECODE_MODEL=your-model-id
```

## Approval Modes

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

### OpenAI-Compatible Backends

For OpenAI-compatible services, use `openai` or `openai-chat` depending on which API shape the backend supports, then point `RECODE_BASE_URL` at that service.

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
```

## Tool System

| Tool | Purpose | Notes |
| --- | --- | --- |
| `Bash` | Run shell commands | 30s timeout, 12KB output cap, validation + optional `bubblewrap` |
| `Read` | Read files | Limited to text files up to 1MB |
| `Write` | Write files | Creates parent directories automatically |
| `Edit` | Replace one unique text fragment | Fails if the target is missing or not unique |
| `Glob` | Find files by glob pattern | Up to 100 results |
| `Grep` | Search file contents by regex | Supports content mode and files-with-matches mode |

All file operations are constrained to the workspace root through safe path resolution.

## Project Layout

```text
recode/
├── src/
│   ├── agent/       # Agent loop
│   ├── ai/          # Internal AI transport layer
│   ├── config/      # Persistent user config
│   ├── errors/      # Error types
│   ├── history/     # Persistent sessions and HTML export
│   ├── messages/    # Conversation message model
│   ├── models/      # Runtime model factory
│   ├── prompt/      # System prompt
│   ├── runtime/     # Runtime config loading
│   ├── shared/      # Shared helpers
│   ├── tools/       # Tool system
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
