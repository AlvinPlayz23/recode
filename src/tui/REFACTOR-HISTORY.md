# TUI Refactor History

This file tracks responsibility extractions from [app.tsx](./app.tsx) so future refactors can build on them instead of re-discovering the same seams.

| Pass | What Was Refactored Out of `app.tsx` | New File |
| --- | --- | --- |
| 1 | Conversation/session persistence helpers, draft conversation creation, model-selection persistence, runtime restore helpers | [conversation-session.ts](./conversation-session.ts) |
| 1 | Workspace `@file` suggestion parsing, async file indexing, cache invalidation, draft suggestion application | [file-suggestions.ts](./file-suggestions.ts) |
| 2 | Built-in command body generation for `/help`, `/status`, `/config`, plus context-window snapshot helpers | [builtin-command-content.ts](./builtin-command-content.ts) |
| 3 | History picker loading/filtering/restore flow, close-state reset helpers, timestamp formatting | [history-picker.ts](./history-picker.ts) |

## Notes

- `app.tsx` still owns the main interaction loop, picker state, streaming state, and rendering.
- The next likely seams are theme/approval/layout picker orchestration and transcript rehydration.
- When moving logic out of `app.tsx`, prefer modules that are either:
  - pure formatting/data helpers with direct tests, or
  - stateful helpers with a narrow, explicit API and dedicated tests.
