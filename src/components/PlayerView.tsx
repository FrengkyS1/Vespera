import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import {
  appForeground,
  controlsWindow,
  emitControlsState,
  mpvLoad,
  mpvResize,
  mpvSetDouble,
  mpvStart,
  mpvStop,
  onMpvEvent,
  onPlayerAction,
  setProgress as saveProgress,
  type Progress,
  type Rect,
  type VideoFile,
} from "../api";
import { keyToAction, normalizeKey } from "../keybinds";
import { runTransportAction } from "../playerActions";
import { ControlBar } from "./ControlBar";

// Physical-pixel rect of the video stage (fallback layout: video above the bar).
function stageRect(el: HTMLElement | null): Rect {
  const r = el?.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.floor((r?.left ?? 0) * dpr),
    y: Math.floor((r?.top ?? 0) * dpr),
    w: Math.ceil((r?.width ?? 0) * dpr),
    h: Math.ceil((r?.height ?? 0) * dpr),
  };
}

interface Props {
  video: VideoFile;
  resume?: Progress;
  defaultVolume: number;
  keybinds: Record<string, string>;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function PlayerView({ video, resume, defaultVolume, keybinds, onClose, onNext, onPrev }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const fullscreenRef = useRef(false);
  const pathRef = useRef(video.path);
  const startedRef = useRef(false);
  // Assume the overlay window exists until proven otherwise; only then does the
  // in-window ControlBar fall back into view (graceful degradation).
  const [overlayMode, setOverlayMode] = useState(true);
  const overlayModeRef = useRef(true);
  overlayModeRef.current = overlayMode;
  const syncOverlayRef = useRef<(() => void) | null>(null);

  const cb = useRef({ onClose, onNext, onPrev });
  cb.current = { onClose, onNext, onPrev };
  const keyMapRef = useRef(keyToAction(keybinds));
  keyMapRef.current = keyToAction(keybinds);
  const keybindsRef = useRef(keybinds);
  keybindsRef.current = keybinds;

  // Authoritative video rect. In overlay mode the video fills the whole window,
  // so read the window's inner size directly instead of a DOM rect — the DOM can
  // still report the pre-transition size during a fullscreen toggle (black bars).
  const measure = async (): Promise<Rect> => {
    if (overlayModeRef.current) {
      try {
        const s = await getCurrentWindow().innerSize();
        return { x: 0, y: 0, w: s.width, h: s.height };
      } catch {
        /* fall through to DOM measurement */
      }
    }
    return stageRect(stageRef.current);
  };

  const saveNow = () => {
    if (pathRef.current && posRef.current > 0 && durRef.current > 0) {
      saveProgress(pathRef.current, posRef.current, durRef.current);
    }
  };
  const handleBack = () => {
    saveNow();
    cb.current.onClose();
  };
  const handleNext = () => {
    saveNow();
    cb.current.onNext();
  };
  const handlePrev = () => {
    saveNow();
    cb.current.onPrev();
  };
  const toggleFullscreen = async () => {
    const win = getCurrentWindow();
    const fs = !fullscreenRef.current;
    try {
      await win.setFullscreen(fs);
      fullscreenRef.current = fs;
    } catch {
      return;
    }
    // The window resize is async; re-apply the video + overlay geometry once the
    // new bounds settle (rAF), then again shortly after to catch slow drivers.
    const reflow = async () => {
      try {
        await mpvResize(await measure());
      } catch {
        /* ignore */
      }
      syncOverlayRef.current?.();
    };
    requestAnimationFrame(reflow);
    window.setTimeout(reflow, 180);
  };

  // ── Overlay window: show/position/sync the transparent "controls" window over
  // the main window, and receive its forwarded app-level actions. ──
  useEffect(() => {
    let disposed = false;
    const main = getCurrentWindow();
    const unlisteners: Array<() => void> = [];
    let overlay: Awaited<ReturnType<typeof controlsWindow>> = null;
    let fgTimer = 0;
    let shown = false;

    const sync = async () => {
      if (!overlay) return;
      try {
        const p = await main.outerPosition();
        const s = await main.outerSize();
        await overlay.setPosition(new PhysicalPosition(p.x, p.y));
        await overlay.setSize(new PhysicalSize(s.width, s.height));
      } catch {
        /* ignore */
      }
    };
    syncOverlayRef.current = () => void sync();
    const showOverlay = async () => {
      if (!overlay || shown) return;
      shown = true;
      await sync();
      try {
        await overlay.show();
        await overlay.setAlwaysOnTop(true);
        await main.setFocus(); // keep keyboard focus on the app, not the overlay
      } catch {
        /* ignore */
      }
    };
    const hideOverlay = async () => {
      if (!overlay || !shown) return;
      shown = false;
      try {
        await overlay.hide();
      } catch {
        /* ignore */
      }
    };

    (async () => {
      overlay = await controlsWindow();
      if (disposed) {
        await hideOverlay();
        return;
      }
      if (!overlay) {
        setOverlayMode(false); // no overlay window → fall back to the in-window bar
        return;
      }
      emitControlsState({ active: true, title: video.title, keybinds: keybindsRef.current });
      await showOverlay();

      unlisteners.push(await main.onMoved(() => sync()));
      unlisteners.push(await main.onResized(() => sync()));
      unlisteners.push(
        await onPlayerAction((a) => {
          if (a === "close") {
            if (fullscreenRef.current) toggleFullscreen();
            else handleBack();
          } else if (a === "next") handleNext();
          else if (a === "prev") handlePrev();
          else if (a === "fullscreen") toggleFullscreen();
        }),
      );

      // Never let the always-on-top overlay float over other apps.
      fgTimer = window.setInterval(async () => {
        let fg = true;
        try {
          fg = await appForeground();
        } catch {
          /* ignore */
        }
        if (fg) showOverlay();
        else hideOverlay();
      }, 300);
    })();

    return () => {
      disposed = true;
      syncOverlayRef.current = null;
      if (fgTimer) window.clearInterval(fgTimer);
      unlisteners.forEach((u) => u());
      emitControlsState({ active: false, title: "", keybinds: keybindsRef.current });
      hideOverlay();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the overlay's title in sync as next/prev change the current video.
  useEffect(() => {
    if (!overlayMode) return;
    emitControlsState({ active: true, title: video.title, keybinds: keybindsRef.current });
  }, [video.title, overlayMode]);

  // ── Player lifecycle: mpv events, keyboard, sizing ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    const onResize = async () => {
      try {
        await mpvResize(await measure());
      } catch {
        /* ignore */
      }
    };

    (async () => {
      unlisten = await onMpvEvent((e) => {
        if (e.event === "end-file") {
          if (e.reason === 0) {
            saveNow();
            cb.current.onNext();
          }
          return;
        }
        if (e.event !== "property-change") return;
        if (e.name === "time-pos" && typeof e.data === "number") posRef.current = e.data;
        else if (e.name === "duration" && typeof e.data === "number") durRef.current = e.data;
      });
    })();

    const save = window.setInterval(saveNow, 5000);
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => onResize());
    if (stageRef.current) ro.observe(stageRef.current);

    const onKey = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreenRef.current) toggleFullscreen();
        else handleBack();
        return;
      }
      const action = keyMapRef.current[normalizeKey(e.key)];
      if (!action) return;
      e.preventDefault();
      if (action === "next") handleNext();
      else if (action === "prev") handlePrev();
      else if (action === "fullscreen") await toggleFullscreen();
      else runTransportAction(action);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearInterval(save);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      saveNow();
      if (unlisten) unlisten();
      win.setFullscreen(false).catch(() => {});
      mpvStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start mpv (idempotent) + load the current video; re-runs on next/prev.
  useEffect(() => {
    pathRef.current = video.path;
    posRef.current = 0;
    durRef.current = resume?.duration ?? 0;
    (async () => {
      try {
        await mpvStart(await measure());
        if (!startedRef.current) {
          await mpvSetDouble("volume", defaultVolume);
          startedRef.current = true;
        }
        await mpvLoad(video.path, resume?.position ?? 0);
        // Re-apply the video geometry a few times: if playback starts while the
        // window is already fullscreen, the mpv child's first paint can land
        // before the inner size settles, leaving a black band. Cheap + idempotent.
        const reapply = () => measure().then((r) => mpvResize(r));
        requestAnimationFrame(reapply);
        [80, 260, 600].forEach((d) => window.setTimeout(reapply, d));
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.path]);

  return (
    <div className="player-full">
      <div className="player-stage" ref={stageRef}>
        <div className="player-loading">
          <Loader2 className="spin" size={26} />
          <span>{video.title}</span>
          <span className="player-hint">Move the mouse for controls · F fullscreen · Esc back</span>
        </div>
      </div>
      {!overlayMode && (
        <ControlBar
          title={video.title}
          onBack={handleBack}
          onNext={handleNext}
          onPrev={handlePrev}
          onFullscreen={toggleFullscreen}
        />
      )}
    </div>
  );
}
