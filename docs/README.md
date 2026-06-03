# Recode Documentation

This directory contains the current user and integration documentation for Recode. The root [`README.md`](../README.md) is the quick project overview; these docs go deeper on specific surfaces.

## Main Docs

| Document | Purpose |
| --- | --- |
| [`acp-server/README.md`](./acp-server/README.md) | JSON-RPC ACP server transports, methods, session updates, approvals, and client examples. |
| [`provider/reasoning-thinking-support.md`](./provider/reasoning-thinking-support.md) | How Recode maps provider reasoning/thinking streams and request options. |
| [`../desktop-app/README.md`](../desktop-app/README.md) | Desktop app architecture, development commands, runtime modes, and current limitations. |

## Runtime Surfaces

Recode currently exposes four runtime surfaces:

1. **Interactive TUI** — `recode` or `bun run start`.
2. **One-shot CLI** — `recode <prompt>` or `bun run src/index.ts "..."`.
3. **ACP server** — `recode acp-server` or `recode acp-server --stdio` for external clients.
4. **Desktop app** — `desktop-app/`, an Electrobun + React frontend that uses ACP stdio sessions.

All surfaces share the same core model/provider configuration and agent/tool runtime.

## Configuration Reference

Default config path:

```text
~/.recode/config.json
```

Important top-level fields:

| Field | Meaning |
| --- | --- |
| `version` | Config schema version. Current value is `1`. |
| `providers` | Saved provider definitions. |
| `activeProviderId` | Provider selected by default. |
| `themeName` | TUI theme. |
| `toolMarkerName` | TUI tool marker. |
| `approvalMode` | `approval`, `auto-edits`, or `yolo`. |
| `approvalAllowlist` | Persisted approval scopes. |
| `permissionRules` | Pattern-based allow/deny/ask rules. |
| `layoutMode` | TUI layout mode. |
| `minimalMode` | Whether the TUI header is hidden. |
| `todoPanelEnabled` | Whether the composer todo panel is shown. |
| `agents` | Optional named subagent configuration. |

Provider fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable provider ID used by CLI flags and config. |
| `name` | Display name. |
| `kind` | Provider kind, such as `openai`, `anthropic`, or `openai-chat`. |
| `baseUrl` | Provider API base URL. |
| `apiKey` | Optional API key. |
| `headers` | Optional extra HTTP headers. |
| `options` | Optional provider request options and Recode transport controls. |
| `models` | Saved model IDs and optional labels/context windows. |
| `defaultModelId` | Default model for this provider. |
| `maxOutputTokens` | Optional request default. |
| `temperature` | Optional request default. |
| `toolChoice` | Optional `auto` or `required`. |
| `disabled` | Hide/disable the provider in selection flows. |

## Provider Kinds

| Kind | Backend |
| --- | --- |
| `openai` | OpenAI Responses API. |
| `openai-chat` | Generic OpenAI-compatible Chat Completions API. |
| `openai-oauth` | ChatGPT/Codex backend through OpenAI OAuth. |
| `anthropic` | Anthropic Messages API. |
| `gemini` | Gemini through Google AI Studio's OpenAI-compatible endpoint. |
| `groq` | Groq OpenAI-compatible endpoint. |
| `aihubmix` | AIHubMix OpenAI-compatible gateway. |
| `deepseek` | DeepSeek OpenAI-compatible endpoint. |
| `z-ai` | Z.AI / GLM general endpoint. |
| `z-ai-coding` | Z.AI / GLM Coding Plan endpoint. |
| `huggingface` | Hugging Face Inference Providers router. |

## Environment Overrides

The `.env.example` file documents the common overrides:

```bash
RECODE_CONFIG_PATH=~/.recode/config.json
RECODE_ACTIVE_PROVIDER=my-provider
RECODE_PROVIDER=openai-chat
RECODE_API_KEY=...
RECODE_BASE_URL=http://127.0.0.1:11434/v1
RECODE_MODEL=qwen3:8b
```

Environment values are useful for temporary local changes. Persistent provider setup should normally be done through `recode setup`.

## Common Verification

From the repository root:

```bash
bun run check
bun run test
```

For desktop-specific work, run checks from `desktop-app/` as well:

```bash
bun run check
bun run smoke:spawn
bun run smoke:acp
```

Docs-only edits do not require typechecking unless they describe behavior that was changed in code at the same time.
