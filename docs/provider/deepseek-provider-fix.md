# DeepSeek Thinking Mode Provider Fix

## Problem

DeepSeek thinking mode returns chain-of-thought content in a provider-specific
`reasoning_content` field alongside the normal assistant `content`.

For normal assistant turns without tool calls, DeepSeek says previous
`reasoning_content` can be omitted from later requests. For assistant turns that
perform tool calls, DeepSeek requires the full `reasoning_content` from that
assistant message to be sent back in every later request. If it is omitted, the
provider returns HTTP 400 with an error like:

```text
The `reasoning_content` in the thinking mode must be passed back to the API.
```

This can also happen when DeepSeek models are routed through a generic
OpenAI-compatible provider id, for example a provider named `zen` using a model
id such as `deepseek-v4-flash-free`.

## Solution Used

Recode now preserves and replays DeepSeek thinking metadata through the
OpenAI-compatible chat path:

- Capture streamed `delta.reasoning_content` as a hidden `reasoning-delta`.
- Accumulate reasoning deltas during the agent step.
- Store the result on the assistant transcript message as provider metadata.
- Persist and restore that metadata through history parsing.
- Serialize it back as `reasoning_content` on later assistant messages when the
  target provider/model is DeepSeek-compatible.
- Detect DeepSeek compatibility from provider id, provider name, base URL, or
  model id, so routed models such as `zen` + `deepseek-v4-flash-free` are covered.

This matches DeepSeek's documented tool-call requirement while avoiding visible
chain-of-thought display in the TUI or final answer.

## Source

DeepSeek official docs:

https://api-docs.deepseek.com/guides/thinking_mode
