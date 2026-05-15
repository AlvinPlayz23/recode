# Recode Desktop

Recode Desktop is a beta desktop GUI wrapper for the Recode CLI. It uses Electrobun for the native shell and keeps the approved Vite + React frontend in `web/`.

The desktop app is not a separate agent runtime. Its job is to provide a native UI that can later run and manage multiple `recode acp-server` sessions across different workspace folders.

## Status

This app is currently in beta / early migration work.

Current state:

- Vite + React renderer lives in `desktop-app/web/`
- Electrobun host lives in `desktop-app/src/bun/`
- Production renderer assets are copied from `web/dist` into the Electrobun bundle
- Bun-side child process spawning is smoke-tested for future ACP server management
- Real ACP client wiring is not implemented yet

## Renderer Mock Data

The React renderer still keeps Phase 1 mock projects, threads, and messages for plain browser/Vite preview mode only. This lets `desktop-app/web` render a useful UI when it is opened without Electrobun or ACP.

The Electrobun desktop runtime disables that mock state. In desktop mode, the app starts from the persisted desktop snapshot and waits for real workspaces, sessions, and model options from the Recode ACP server. Browser preview threads use the neutral `Recode default` model label until real ACP model options are available.

## Tool Message Forwarding (`toChatMessage`)

Incoming session updates from the Bun side arrive as `DesktopMessage` objects (see `web/src/desktop-rpc.ts`). The renderer keeps its own `ChatMessage` shape (`web/src/types.ts`) which extends those messages with the per-tool fields the transcript needs to render rich indicators:

- `toolCallId` and `toolKind` — identify the tool call within the turn
- `toolStatus` — `pending` / `in_progress` / `completed` / `failed`, used to drive the shimmering label and chevron color
- `toolInput` — the structured arguments the tool was invoked with
- `toolContent` — accumulated tool output / result body

`toChatMessage` in `web/src/App.tsx` is the small adapter that copies all of those fields from a `DesktopMessage` into a renderer `ChatMessage`. It is used in two places:

1. The initial `getSnapshot` load, so persisted tool calls keep their status when the app restarts.
2. The live `onSessionUpdate` callback, for both newly appended messages and replaced messages.

If a future field is added to `DesktopMessage` that the transcript needs to render, it must also be added to `toChatMessage` — otherwise the renderer will silently drop it (which is what previously caused the running-tool shimmer to never fire: `toolStatus` was being stripped on the way into React state).

## Startup Behavior

On restart, the desktop app restores saved workspaces, threads, and messages into the sidebar, but it does not auto-open the most recent thread. The main pane stays on the start screen until the user picks a thread or creates a new one.

When the user selects an existing saved thread, the app lazily resumes the matching ACP session and loads model/mode options for that thread. This avoids starting ACP processes for every saved thread during app boot while still keeping model switching available after a thread is selected.

## Commands

Install dependencies with pnpm only:

```bash
pnpm install
```

Run scripts with Bun:

```bash
bun run dev
bun run check
bun run smoke:spawn
bun run build
```

## Recode Runtime Mode

The desktop app currently defaults to **dev** runtime mode.

- `dev`: starts Recode from the selected/detected repo with `bun --config=<recode-repo-root>/desktop-app/bunfig.acp.toml run <recode-repo-root>/src/index.ts acp-server --stdio`
- `prod`: starts Recode with `recode acp-server --stdio`

Dev is the default because Recode is currently used from a local repo and is not yet published/built as an installed desktop dependency. The app tries to auto-detect the Recode repo root and also lets the user choose it in Settings. When the desktop app is packaged for real distribution, change the default runtime mode to `prod` so it uses the installed `recode` command.

## Windows DPI Fix

During the first Electrobun build, the app looked blurry / low-resolution on Windows. Even DevTools looked blurry, and the renderer reported:

```js
window.devicePixelRatio // 1
```

On a scaled Windows display, that means the process was not DPI-aware and Windows was bitmap-scaling the whole app surface.

The fix is to embed a per-monitor DPI-aware Windows manifest into the generated Electrobun executables after packaging:

- `assets/windows-dpi-aware.manifest`
- `scripts/patch-windows-dpi-manifest.ts`
- `electrobun.config.ts` `postPackage` hook

After the fix, the app reports the correct scale, for example:

```js
console.log(window.devicePixelRatio, window.innerWidth, window.outerWidth)
// 1.25 1536 1536
```

That confirms the WebView is rendering at the real display scale instead of being upscaled by Windows.
