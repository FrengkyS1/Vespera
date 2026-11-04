# Vespera — State Ledger

_Last reconciled: 2026-07-11_

## Executive Summary
Desktop anime/video player: Tauri v2 (Rust + React 19), libmpv embedded via
hand-written FFI in a native Win32 child window, AniList metadata. Windows-only.
Dev: `npm run tauri dev`. Build for WebDriver testing: `npm run tauri build --no-bundle`
(plain `cargo build` won't render — see Gotchas).

## Architectural Delta
- `src/components/Overlay.tsx` + `src/main.tsx` — uncommitted, in-progress second
  window ("controls": a transparent always-on-top overlay meant to replace the
  in-window `ControlBar` fallback) → IMPACT: working tree has 14 modified files +
  2 new untracked files (`Overlay.tsx`, `playerActions.ts`) not yet committed;
  last 5 commits show repeated attempts to fix this overlay getting "stuck
  mid-screen" — treat as fragile/unfinished, verify overlay positioning after
  any window-geometry change before assuming it's done.

## Deflected
- Driving the native "Add Folder" OS file-picker via WebDriver — not attempted:
  it's a real Explorer dialog outside the WebView, no way to close it
  programmatically if it hangs the automation session. DO NOT RE-EXPLORE without
  a different automation approach (e.g. pre-seeding config.toml folders directly).

## ADL
- `mcp-servers/waybound-mcp` app_launch — resolves `target/release` before
  `target/debug`; always rebuild release (`--no-bundle`) for WebDriver retests,
  a debug-only rebuild is silently ignored.

## Gotchas
- waybound-mcp `app_launch` on this project attaches WebDriver to whichever
  window (`main` or `controls` overlay) happened to init first — not always
  `main`. Symptom: snapshot shows `"0:00 / 0:00"` with no sidebar. FIX: call
  `app_list_windows` and `app_switch_window` to find the one with `<aside>` in
  its snapshot.
- `PlayerView`'s `.player-loading` spinner never disappears in
  `app_screenshot` even once mpv is actually playing — the native mpv child
  HWND paints over it in real use but WebDriver's screenshot only captures the
  WebView surface, not composited native child windows. Not a bug; don't chase it.
