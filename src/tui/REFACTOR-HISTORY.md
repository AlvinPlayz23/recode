# TUI Refactor History

This file tracks responsibility extractions from [app.tsx](./app.tsx) so future refactors can build on them instead of re-discovering the same seams.

## Current Size

- Current [app.tsx](./app.tsx): `3576` lines
- Starting point for this refactor effort: `4632` lines
- Net reduction so far: `1056` lines

| Pass | What Was Refactored Out of `app.tsx` | New File |
| --- | --- | --- |
| 1 | Conversation/session persistence helpers, draft conversation creation, model-selection persistence, runtime restore helpers | [conversation-session.ts](./conversation-session.ts) |
| 1 | Workspace `@file` suggestion parsing, async file indexing, cache invalidation, draft suggestion application | [file-suggestions.ts](./file-suggestions.ts) |
| 2 | Built-in command body generation for `/help`, `/status`, `/config`, plus context-window snapshot helpers | [builtin-command-content.ts](./builtin-command-content.ts) |
| 3 | History picker loading/filtering/restore flow, close-state reset helpers, timestamp formatting | [history-picker.ts](./history-picker.ts) |
| 4 | Shared overlay-facing TUI types for picker rows, interactive requests, and transient UI state | [tui-app-types.ts](./tui-app-types.ts) |
| 4 | Selector windowing, scroll sync, model-picker line shaping, and popup sizing math | [selector-navigation.ts](./selector-navigation.ts) |
| 4 | Model picker overlay JSX | [model-picker-overlay.tsx](./model-picker-overlay.tsx) |
| 4 | History picker overlay JSX | [history-picker-overlay.tsx](./history-picker-overlay.tsx) |
| 4 | Theme picker overlay JSX | [theme-picker-overlay.tsx](./theme-picker-overlay.tsx) |
| 4 | Customize overlay JSX | [customize-overlay.tsx](./customize-overlay.tsx) |
| 4 | Approval mode overlay JSX | [approval-mode-overlay.tsx](./approval-mode-overlay.tsx) |
| 4 | Layout picker overlay JSX | [layout-picker-overlay.tsx](./layout-picker-overlay.tsx) |
| 4 | Question overlays, including the context-window prompt UI | [question-overlay.tsx](./question-overlay.tsx) |
| 4 | Tool-approval overlay JSX | [tool-approval-overlay.tsx](./tool-approval-overlay.tsx) |
| 4 | Toast overlay JSX | [toast-overlay.tsx](./toast-overlay.tsx) |
| 5 | Keyboard routing helpers for question prompts, tool approval, pickers, `@file` suggestions, and slash-command suggestions | [keyboard-router.ts](./keyboard-router.ts) |
| 5 | Single-turn agent runner and compact paste expansion helpers used during prompt submission | [prompt-submission-controller.ts](./prompt-submission-controller.ts) |
| 5 | Slash-command textarea caret stabilization after visible-draft sync and prompt remounts | [app.tsx](./app.tsx) |

## Stabilization After Pass 5

- Overlay components now render as absolute modal surfaces instead of participating in normal transcript/composer layout flow.
- The history picker now uses compact two-line rows, a short-list non-scroll path, and filtered-list remount keys to reduce scroll-gap regressions.
- Prompt textarea remounts and same-value visible-draft syncs now restore the slash-command caret to the end instead of letting typed letters insert behind the first character.

## Notes

- `app.tsx` still owns the main interaction loop, picker state, streaming state, and built-in command dispatch.
- The next likely seams are built-in command dispatch, deeper prompt submission orchestration, transcript rehydration, and entry rendering.
- When moving logic out of `app.tsx`, prefer modules that are either:
  - pure formatting/data helpers with direct tests, or
  - stateful helpers with a narrow, explicit API and dedicated tests.
