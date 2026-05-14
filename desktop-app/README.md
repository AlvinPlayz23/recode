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
