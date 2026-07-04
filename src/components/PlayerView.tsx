import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import {
  appForeground,
  cursorPos,
  mpvCommand,
  mpvLoad,
  mpvResize,
  mpvSetDouble,
  mpvStart,
  mpvStop,
  onMpvEvent,
  setProgress as saveProgress,
  type Progress,
  type Rect,
  type VideoFile,
} from "../api";
import { keyToAction, normalizeKey, type PlayerAction } from "../keybinds";

const CONTROLS_H = 150; // logical px height of the floating overlay controls

// Physical-pixel rect of the full video area. Floor origin / ceil size so the
// native video window fully covers it (no sub-pixel black edge). The video
// stays full-window at all times; the controls float on top, so it never
// shrinks and never letterboxes from the bar.
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
  keybinds: Record<PlayerAction, string>;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function PlayerView({ video, resume, defaultVolume, keybinds, onClose, onNext, onPrev }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const pausedRef = useRef(false);
  const fullscreenRef = useRef(false);
  const pathRef = useRef(video.path);
  const startedRef = useRef(false);

  const cb = useRef({ onClose, onNext, onPrev });
  cb.current = { onClose, onNext, onPrev };

  const keyMapRef = useRef(keyToAction(keybinds));
  keyMapRef.current = keyToAction(keybinds);

  const saveNow = () => {
    if (pathRef.current && posRef.current > 0 && durRef.current > 0) {
      saveProgress(pathRef.current, posRef.current, durRef.current);
    }
  };

  // ── Player lifecycle: mpv events, keyboard, floating controls, sizing ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unNav: Array<() => void> = [];
    let poll: number | undefined;
    let bar: WebviewWindow | null = null;
    const main = getCurrentWindow();
    const onResize = () => mpvResize(stageRect(stageRef.current));

    const goBack = () => {
      saveNow();
      cb.current.onClose();
    };
    const goNext = () => {
      saveNow();
      cb.current.onNext();
    };
    const goPrev = () => {
      saveNow();
      cb.current.onPrev();
    };
    const toggleFullscreen = async () => {
      const fs = !fullscreenRef.current;
      try {
        await main.setFullscreen(fs);
        fullscreenRef.current = fs;
      } catch {
        /* ignore */
      }
    };

    (async () => {
      unlisten = await onMpvEvent((e) => {
        if (e.event === "end-file") {
          if (e.reason === 0) goNext();
          return;
        }
        if (e.event !== "property-change") return;
        if (e.name === "time-pos" && typeof e.data === "number") posRef.current = e.data;
        else if (e.name === "duration" && typeof e.data === "number") durRef.current = e.data;
        else if (e.name === "pause" && typeof e.data === "boolean") pausedRef.current = e.data;
      });

      // Nav / fullscreen actions emitted by the floating controls window.
      unNav.push(await listen("vespera://back", goBack));
      unNav.push(await listen("vespera://next", goNext));
      unNav.push(await listen("vespera://prev", goPrev));
      unNav.push(await listen("vespera://fullscreen", () => toggleFullscreen()));

      // Create (or reuse) the transparent, always-on-top controls overlay.
      const existing = (await getAllWebviewWindows()).find((w) => w.label === "controls");
      bar =
        existing ??
        new WebviewWindow("controls", {
          url: "index.html?view=controls",
          decorations: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          focus: false,
          shadow: false,
          resizable: false,
          visible: false,
          width: 900,
          height: CONTROLS_H,
          title: "controls",
        });

      // Position + auto-hide, driven by the global cursor. Gated on Vespera being
      // the foreground app (via app_foreground), so the overlay never floats over
      // other apps and still shows while the video itself has focus.
      const scale = await main.scaleFactor().catch(() => 1);
      let lastCur: [number, number] = [-1, -1];
      let lastMove = Date.now();
      let shown = false;
      let lastBounds = "";
      poll = window.setInterval(async () => {
        if (!bar) return;
        try {
          const [cur, op, os, foreground, minimized] = await Promise.all([
            cursorPos(),
            main.outerPosition(),
            main.outerSize(),
            appForeground(),
            main.isMinimized(),
          ]);
          const barPx = Math.round(CONTROLS_H * scale);
          const x = op.x;
          const y = op.y + os.height - barPx;
          const bounds = `${x},${y},${os.width},${barPx}`;
          if (bounds !== lastBounds) {
            lastBounds = bounds;
            await bar.setPosition(new PhysicalPosition(x, y));
            await bar.setSize(new PhysicalSize(os.width, barPx));
          }
          const moved = cur[0] !== lastCur[0] || cur[1] !== lastCur[1];
          lastCur = cur;
          if (moved) lastMove = Date.now();
          const inWindow =
            cur[0] >= op.x && cur[0] <= op.x + os.width && cur[1] >= op.y && cur[1] <= op.y + os.height;
          const inZone = inWindow && cur[1] >= y - Math.round(40 * scale);
          const active = Date.now() - lastMove < 2600;
          const want = !minimized && foreground && (pausedRef.current || inZone || (inWindow && active));
          if (want && !shown) {
            shown = true;
            await bar.show();
          } else if (!want && shown) {
            shown = false;
            await bar.hide();
          }
        } catch {
          /* window closing */
        }
      }, 130);
    })();

    const save = window.setInterval(saveNow, 5000);
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => onResize());
    if (stageRef.current) ro.observe(stageRef.current);

    const onKey = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreenRef.current) {
          await main.setFullscreen(false).catch(() => {});
          fullscreenRef.current = false;
        } else {
          goBack();
        }
        return;
      }
      const action = keyMapRef.current[normalizeKey(e.key)];
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case "playPause": mpvCommand(["cycle", "pause"]); break;
        case "seekBack": mpvCommand(["seek", "-5", "relative"]); break;
        case "seekFwd": mpvCommand(["seek", "5", "relative"]); break;
        case "seekBackLong": mpvCommand(["seek", "-10", "relative"]); break;
        case "seekFwdLong": mpvCommand(["seek", "10", "relative"]); break;
        case "volUp": mpvCommand(["add", "volume", "5"]); break;
        case "volDown": mpvCommand(["add", "volume", "-5"]); break;
        case "mute": mpvCommand(["cycle", "mute"]); break;
        case "next": goNext(); break;
        case "prev": goPrev(); break;
        case "fullscreen": await toggleFullscreen(); break;
        case "cycleFit": mpvCommand(["cycle-values", "panscan", "1.0", "0.0"]); break;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearInterval(save);
      if (poll) window.clearInterval(poll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      unNav.forEach((u) => u());
      saveNow();
      if (unlisten) unlisten();
      main.setFullscreen(false).catch(() => {});
      if (bar) bar.close().catch(() => {});
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
        await mpvStart(stageRect(stageRef.current));
        if (!startedRef.current) {
          await mpvSetDouble("volume", defaultVolume);
          startedRef.current = true;
        }
        await mpvLoad(video.path, resume?.position ?? 0);
        requestAnimationFrame(() => mpvResize(stageRect(stageRef.current)));
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
        </div>
      </div>
    </div>
  );
}
