# Vespera

A lightweight desktop video player — **Tauri (Rust + React)** with **embedded libmpv**
for true in-window playback (the same model as seanime's built-in "Denshi" player).
Browse a local library with thumbnails and resume, play in-window with mpv's engine.
Warm "evening star" twilight theme.

> Successor to the native C++/Win32 LuminaPlayer. Same playback fidelity (libmpv),
> a modern declarative UI, and the player engine bundled in — no separate mpv install.

## How it works

- **Frontend** — React 19 + Vite + TypeScript, plain CSS theme.
- **Backend** — Rust (Tauri v2): library scan, config + resume persistence, thumbnails.
- **Playback** — **libmpv via FFI** (bundled engine, no separate mpv install).
  Hand-written C bindings drive libmpv, which renders in its own window with mpv's
  on-screen controller and key bindings. Property changes (`time-pos`, `duration`,
  `pause`) stream back to the UI as events for resume tracking and the now-playing
  bar. (Compositing video *inside* the WebView2 surface via `wid` didn't render
  reliably, so libmpv manages its own video window — see Status.)

## libmpv setup (one-time, for building)

The build links against libmpv and ships `libmpv-2.dll` next to the executable.
These binaries are gitignored (118 MB); to set up a fresh checkout, place them in
`src-tauri/libmpv/`:

1. Get `libmpv-2.dll` + headers from an mpv dev build (or scoop's mpv).
2. Generate the MSVC import lib from the DLL:
   ```bash
   # from a VS dev shell, in src-tauri/libmpv/
   dumpbin /exports libmpv-2.dll | <extract mpv_* names> > mpv.def   # prefix with "EXPORTS"
   lib /def:mpv.def /out:mpv.lib /machine:x64 /name:libmpv-2.dll
   ```
3. `build.rs` links `mpv` from `src-tauri/libmpv/` and copies the DLL to the output.

## Develop / Build

```bash
npm install
npm run tauri dev      # requires Rust toolchain + libmpv set up as above
npm run tauri build
```

## Status

- ✅ Frontend builds (`npm run build`), backend **builds and links libmpv** (`cargo build`).
- ✅ Library scan, config + resume, thumbnails, seanime-style cards + sidebar,
  multi-folder add, twilight theme.
- ✅ libmpv FFI: create/initialize, loadfile + resume, property observation →
  events, command/set-property, event thread.
- ✅ UI stays responsive on load — thumbnail work is async (`spawn_blocking`) and
  mpv detection is cached (`OnceLock`), so it never blocks the UI thread.
- ✅ **In-window video:** a native child window (STATIC) is created over the React
  content area (right of the sidebar) and libmpv embeds into it via `wid`. It is
  raised on play and hidden on stop, so video appears inside the app while the
  sidebar / title bar stay interactive. The sidebar shows a Now Playing strip with
  pause/stop; mpv's OSC handles seek/volume; resize repositions the child window.
- ⚠️ The video child window is positioned from the content area's measured rect ×
  devicePixelRatio. On mixed-DPI or unusual layouts the rect may need tuning — run
  `npm run tauri dev` to verify placement on your display.
