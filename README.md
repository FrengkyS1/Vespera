<div align="center">

# ✦ Vespera

**A desktop anime & video player — Tauri (Rust + React) with libmpv embedded via FFI.**

Browse a local library with AniList cover art, resume where you left off, and play
in-window on mpv's engine — wrapped in a frosted "Aurora Glass" UI.

</div>

## 📸 Screenshots

> _Add captures here_ — drop images in `docs/` and they'll render below.

<!--
![Library](docs/library.png)
![Player](docs/player.png)
-->

| Library (poster grid) | In-window player |
| --- | --- |
| _docs/library.png_ | _docs/player.png_ |

## ✨ Features

- **Local library** — add folders; each is matched to its anime and shown with
  **AniList cover art + banners** in a poster grid.
- **In-window playback** — video renders inside the app on **libmpv**, with a clean
  control bar (play/pause, seek, prev/next, volume) below it.
- **Resume** — every title remembers your position; a progress bar shows it on cards.
- **Thumbnails** — episode thumbnails generated on the fly (libmpv frame-grab,
  rate-limited so a big library never blocks the UI).
- **Keyboard-first** — full shortcut set (below); buttons are keyboard-accessible
  with visible focus, and motion respects `prefers-reduced-motion`.
- **Aurora Glass UI** — deep slate base with a living aurora gradient behind
  frosted-glass panels.

## ⌨️ Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `Space` | Play / pause | `↑` / `↓` | Volume ± |
| `← / →` | Seek ∓5s | `M` | Mute |
| `Z` / `X` | Seek ∓10s | `N` / `P` | Next / previous |
| `Esc` | Back to library | | |

## 🧱 Tech & architecture

| Layer | Stack |
| --- | --- |
| Frontend | React 19 + Vite + TypeScript, hand-written CSS theme |
| Backend | Rust (Tauri v2) — library scan, config/resume persistence, thumbnails |
| Playback | **libmpv via hand-written C FFI** — no separate mpv install |
| Metadata | **AniList GraphQL** (cover/banner/title), cached on disk |

Highlights worth a look in the code:
- **`src-tauri/src/mpv.rs`** — hand-written `extern "C"` bindings to libmpv, plus a
  custom Win32 child window the video renders into (WebView2 can't composite over
  native video, so the bar sits below the video region rather than over it).
- **`src-tauri/src/anilist.rs`** — GraphQL client + disk cache with title cleanup.
- **`src/components/PlayerView.tsx`** — mpv lifecycle, keyboard, and a `ResizeObserver`
  that keeps the native video matched to the stage.

## ⬇️ Install (Windows)

Grab the latest installer from the [**Releases**](../../releases) page:
- `Vespera_x.y.z_x64-setup.exe` (NSIS) — recommended, or the `.msi`.

libmpv is bundled, so there's nothing else to install.

## 🛠️ Build from source

```bash
npm install
npm run tauri dev      # dev (needs Rust toolchain + libmpv set up, below)
npm run tauri build    # release exe + installers in src-tauri/target/release/
```

### libmpv setup (one-time)

The build links libmpv and ships `libmpv-2.dll` next to the exe. These binaries are
gitignored (~118 MB); for a fresh checkout, place them in `src-tauri/libmpv/`:

1. Get `libmpv-2.dll` from an mpv dev build (or scoop's mpv).
2. Generate the MSVC import lib (from a VS dev shell, in `src-tauri/libmpv/`):
   ```bash
   dumpbin /exports libmpv-2.dll   # collect the mpv_* names into mpv.def under "EXPORTS"
   lib /def:mpv.def /out:mpv.lib /machine:x64 /name:libmpv-2.dll
   ```
3. `build.rs` links `mpv` from `src-tauri/libmpv/` and copies the DLL to the output.

## 📝 Notes

- Windows-only today (the embedded video uses Win32 child-window APIs).
- Controls sit in a bar beneath the video rather than overlaid on it — WebView2
  can't reliably composite a web overlay on top of a native video surface, so this
  is the robust approach for a Tauri player.
