# Recode Desktop App — TODO

## Goal

Build a desktop GUI wrapper around the Recode CLI that lets users (and the maintainer) run **multiple parallel Recode sessions/threads across multiple workspaces/folders** at the same time, so coding work can happen in parallel.

The desktop app is **not** a reimplementation of Recode. It is a frontend that drives the existing `recode` CLI by speaking **ACP (Agent Client Protocol)** to it. Recode already exposes an ACP server via `recode acp-server`, so this project is the matching ACP **client**.

## Working Directory

All desktop app work happens inside `desktop-app/`.

```
desktop-app/
├── electrobun-docs/         # Electrobun framework docs (reference)
├── electrobun.config.ts     # Electrobun app/build config
├── package.json             # Desktop shell scripts + dependencies
├── src/bun/                 # Bun host process
├── scripts/                 # Local dev/build smoke helpers
├── vite-to-electrobun.txt   # Guide for converting a Vite app into an Electrobun app
└── web/                     # Vite + React renderer
```

The CLI itself stays untouched in `src/`. The desktop app calls into it.

## Tooling Convention

- **Install dependencies with `pnpm` only** (e.g. `pnpm install`, `pnpm add ...`).
- **Run / execute scripts with `bun`** (e.g. `bun run dev`, `bun run build`, `bunx ...`).
- Do not use `bun install` / `bun add` for this subproject — installs go through pnpm so the lockfile stays consistent.

## Stack Decisions

- **Framework**: [Electrobun](https://electrobun.dev) — system webview based, TypeScript end-to-end, Bun runtime, no Rust, no Electron/CEF bloat. (CEF is optional in Electrobun, but default = system webview.)
- **Frontend (mock + final)**: Vite + React + TypeScript + Tailwind + shadcn/ui (or another component lib if it fits better)
- **Transport to Recode**: ACP over stdio against `recode acp-server`
- **Docs / references**:
  - `acp-docs/` — protocol spec, get-started, libraries, RFDs
  - `effect-acp-ref/` — third-party ACP reference impl (need to determine if it's client, server, or both)
  - `desktop-app/electrobun-docs/` — Electrobun framework docs
  - `desktop-app/vite-to-electrobun.txt` — Vite → Electrobun migration recipe

## Core Product Requirements

- Multiple **sessions / threads** of Recode running concurrently
- Each session bound to its own **workspace folder**
- Switch between sessions without losing state
- Send prompts, view streamed assistant output, view tool calls and results — same iterative loop Recode already runs
- Approval mode + tool approval prompts surfaced in the GUI (not just terminal)
- Persisted history per session (reuse `~/.recode/history` semantics where possible)
- Native-feeling shell (system webview), small binary, fast cold start

## Phases

### CHECKBOX

- [x] **PHASE 1: VITE-REACT-TS-TAILWIND MOCK** *(completed; approved frontend lives in `desktop-app/web/`)*
  - [x] Scaffold Vite + React + TS + Tailwind in `desktop-app/web/`
  - [x] Adapt `desktop-app/mock.html` into React components
    - `ProjectRail` (left icon rail)
    - `SessionsPanel` (collapsible threads list, GSAP-animated width)
    - `MainArea` (header + empty/transcript view)
    - `Composer` (textarea + model/reasoning dropdowns + supervised toggle)
    - `ProjectModal` (mock repo picker)
  - [x] `bun run build` works, `bunx tsc -p tsconfig.app.json --noEmit` clean
  - [x] Live look/feel review with the user — iterate until approved
  - [x] Decide if shadcn/ui gets layered in or if current hand-rolled styles are enough
  - Run with: `bun run dev` from `desktop-app/web`

- [x] **PHASE 1.5: ELECTROBUN INITIALIZATION** *(completed; build/package/spawn verified, GUI dev loop command wired for local visual confirmation)*
  - [x] Follow `desktop-app/vite-to-electrobun.txt` to convert the approved Vite mock into an Electrobun project
  - [x] Add combined dev loop command: `bun run dev` from `desktop-app/` starts Vite then Electrobun against the Vite dev URL
  - [x] Confirm build and packaging work with `bun run build`
  - [x] Confirm Bun-side main process can spawn child processes with `bun run smoke:spawn`
  - [x] Still no real ACP wiring yet — just the shell working end-to-end

- [~] **PHASE 2: ADDING ACP AND STARTING ON MAKING THE DESKTOP APP**
  - [x] Study ACP from `acp-docs/` (protocol/, libraries/, get-started/)
  - [x] Inspect `effect-acp-ref/` to figure out whether it's a usable client, server, or both, and decide whether to depend on it, vendor it, or write our own minimal client
  - [x] Spawn `recode acp-server` per session as a child process from the Electrobun main process
  - [x] Implement the ACP client: initialize, open session, send prompts, stream events, handle tool-call approvals, close session
  - [x] Wire each UI session to its own ACP child process + workspace folder so sessions can run independently
  - [x] Surface approval prompts in the GUI
  - [x] Persist session metadata (workspace path, last activity, etc.)
  - [ ] Verify live GUI: open 2+ sessions in different folders, run prompts in parallel, confirm independence

## Out of Scope (for now)

- Rewriting any Recode CLI behavior
- Building our own model/provider layer in the desktop app
- Mobile / web hosted version
- Auto-update / signing / store distribution (revisit after Phase 2 works)

## Open Questions To Resolve As We Go

- Does `effect-acp-ref/` give us a client we can reuse, or do we roll our own thin ACP client?
- One `recode acp-server` process per session, or one shared process with multiplexed sessions? (ACP spec in `acp-docs/protocol/` should answer this.)
- How should approval mode be configured per-session vs globally in the GUI?
- Where do desktop-app-specific settings live — reuse `~/.recode/config.json`, or a separate `~/.recode/desktop.json`?

## Definition Of Done (per phase)

- **Phase 1 done** when the user signs off on the mock UI look/feel and parallel-session UX.
- **Phase 1.5 done** when the same UI runs inside Electrobun with working dev + build, on the user's machine.
- **Phase 2 done** when the user can open multiple workspaces, run real Recode prompts in parallel via ACP, see streamed output and tool approvals in the GUI, and close/reopen sessions cleanly.
