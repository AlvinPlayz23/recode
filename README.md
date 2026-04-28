# Banka Code

**Banka Code** is a coding agent built with TypeScript and [Bun](https://bun.sh), with a Senren*Banka-inspired TUI terminal interface.

The name comes from [Senren＊Banka](https://www.yuzu-soft.com/products/senren/). The project keeps some of that aesthetic in the UI, but the focus is still a practical local coding agent CLI.

> Warning: this project is still in an early stage. Do not use it in production. The shell sandbox is useful, but it should not be treated as a complete security boundary.

## Features

- TypeScript + Bun with strict compiler settings
- Iterative agent loop with multi-turn tool use
- Interactive TUI mode and one-shot CLI mode
- Internal AI transport layer with support for OpenAI Responses, OpenAI Chat Completions, and Anthropic Messages
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

# Create or update providers in .recode/config.json
bun run src/index.ts setup

# Start the TUI
bun run start

# Run a single prompt
bun run src/index.ts "show me the project structure"
```

## CLI Usage

```text
banka               Start the interactive TUI
banka setup         Open the provider and model setup wizard
banka <prompt>      Run one prompt and print the final answer
banka -h, --help    Show help
banka -v, --version Show version
```

### Built-in TUI Commands

| Command | Description |
| --- | --- |
| `/help` | Show built-in command help |
| `/clear` | Clear the current session |
| `/status` | Show current session status |
| `/models` | Open the model selector |
| `/exit` | Exit Banka Code |
| `/quit` | Exit Banka Code |

## Config File

Banka stores provider definitions in a project-local config file:

```text
.recode/config.json
```

Use `banka setup` to create providers, set base URLs, store model IDs, and choose the active provider.

Each configured provider can define:
- provider ID
- display name
- provider kind (`openai`, `openai-chat`, `anthropic`)
- base URL
- optional API key
- saved model IDs
- default model ID

## Environment Variables

Banka uses Bun's native `.env` loading. No extra `dotenv` dependency is required. Environment variables are optional runtime overrides on top of `.recode/config.json`.

```bash
BANKA_CONFIG_PATH=.recode/config.json
BANKA_ACTIVE_PROVIDER=my-provider
BANKA_PROVIDER=openai
BANKA_API_KEY=your-api-key
BANKA_BASE_URL=https://api.openai.com/v1
BANKA_MODEL=your-model-id
```

### Providers

Supported values for `BANKA_PROVIDER`:

- `openai` -> OpenAI Responses API
- `openai-chat` -> OpenAI Chat Completions API
- `anthropic` -> Anthropic Messages API

### OpenAI-Compatible Backends

For OpenAI-compatible services, use `openai` or `openai-chat` depending on which API shape the backend supports, then point `BANKA_BASE_URL` at that service.

Examples:

```bash
# OpenAI Responses
BANKA_PROVIDER=openai
BANKA_API_KEY=sk-...
BANKA_BASE_URL=https://api.openai.com/v1
BANKA_MODEL=gpt-4.1

# OpenAI-compatible chat backend
BANKA_PROVIDER=openai-chat
BANKA_BASE_URL=http://127.0.0.1:11434/v1
BANKA_MODEL=qwen3:8b

# Anthropic
BANKA_PROVIDER=anthropic
BANKA_API_KEY=sk-ant-...
BANKA_BASE_URL=https://api.anthropic.com/v1
BANKA_MODEL=claude-sonnet-4-20250514
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
banka-code/
├── src/
│   ├── agent/       # Agent loop
│   ├── ai/          # Internal AI transport layer
│   ├── errors/      # Error types
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
├── .recode/        # Local provider and model config
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
