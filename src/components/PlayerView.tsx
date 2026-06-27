import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import {
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

const BAR_H = 112; // logical px height of the floating control bar

function stageRect(el: HTMLElement | null): Rect {
  const r = el?.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.round((r?.left ?? 0) * dpr),
    y: Math.round((r?.top ?? 0) * dpr),
    w: Math.round((r?.width ?? 0) * dpr),
    h: Math.round((r?.height ?? 0) * dpr),
  };
}

interface Props {
  video: VideoFile;
  resume?: Progress;
  defaultVolume: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function PlayerView({ video, resume, defaultVolume, onClose, onNext, onPrev }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const pathRef = useRef(video.path);
  const startedRef = useRef(false);

  const cb = useRef({ onClose, onNext, onPrev });
  cb.current = { onClose, onNext, onPrev };

  const saveNow = () => {
    if (pathRef.current && posRef.current > 0 && durRef.current > 0) {
      saveProgress(pathRef.current, posRef.current, durRef.current);
    }
  };

  // ── Player lifecycle: mpv events, keyboard, control window ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unNav: Array<() => void> = [];
    let poll: number | undefined;
    let bar: WebviewWindow | null = null;
    let shown = false;
    let lastSeen = Date.now();
    let lastBounds = "";

    const onResize = () => mpvResize(stageRect(stageRef.current));

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

      // Nav actions emitted by the control bar window.
      unNav.push(await listen("vespera://back", () => cb.current.onClose()));
      unNav.push(await listen("vespera://next", () => {
        saveNow();
        cb.current.onNext();
      }));
      unNav.push(await listen("vespera://prev", () => {
        saveNow();
        cb.current.onPrev();
      }));

      // Create (or reuse) the floating control bar window.
      const existing = (await getAllWebviewWindows()).find((w) => w.label === "controls");
      bar =
        existing ??
        new WebviewWindow("controls", {
          url: "index.html?view=controls",
          decorations: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          focus: false,
          shadow: false,
          resizable: false,
          visible: false,
          width: 900,
          height: BAR_H,
          title: "controls",
        });

      // Position + auto-hide loop, driven by the global cursor position.
      const main = getCurrentWindow();
      poll = window.setInterval(async () => {
        if (!bar) return;
        try {
          // Only float the bar when Vespera itself is focused/visible, so it
          // never sits on top of other apps.
          const [op, os, scale, cur, focused, minimized] = await Promise.all([
            main.outerPosition(),
            main.outerSize(),
            main.scaleFactor(),
            cursorPos(),
            main.isFocused(),
            main.isMinimized(),
          ]);

          if (!focused || minimized) {
            if (shown) {
              shown = false;
              await bar.hide();
            }
            return;
          }

          const barPx = Math.round(BAR_H * scale);
          const x = op.x;
          const y = op.y + os.height - barPx;

          const bounds = `${x},${y},${os.width},${barPx}`;
          if (bounds !== lastBounds) {
            lastBounds = bounds;
            await bar.setPosition(new PhysicalPosition(x, y));
            await bar.setSize(new PhysicalSize(os.width, barPx));
          }

          const [cx, cy] = cur;
          const triggerTop = y - Math.round(70 * scale);
          const inZone =
            cx >= op.x &&
            cx <= op.x + os.width &&
            cy >= triggerTop &&
            cy <= op.y + os.height;
          const now = Date.now();
          if (inZone) lastSeen = now;
          const wantShown = now - lastSeen < 800;
          if (wantShown && !shown) {
            shown = true;
            await bar.show();
          } else if (!wantShown && shown) {
            shown = false;
            await bar.hide();
          }
        } catch {
          /* window may be closing */
        }
      }, 120);
    })();

    const save = window.setInterval(saveNow, 5000);
    window.addEventListener("resize", onResize);

    const onKey = async (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
          e.preventDefault();
          mpvCommand(["cycle", "pause"]);
          break;
        case "ArrowLeft":
          mpvCommand(["seek", "-5", "relative"]);
          break;
        case "ArrowRight":
          mpvCommand(["seek", "5", "relative"]);
          break;
        case "z":
        case "Z":
          mpvCommand(["seek", "-10", "relative"]);
          break;
        case "x":
        case "X":
          mpvCommand(["seek", "10", "relative"]);
          break;
        case "ArrowUp":
          mpvCommand(["add", "volume", "5"]);
          break;
        case "ArrowDown":
          mpvCommand(["add", "volume", "-5"]);
          break;
        case "m":
        case "M":
          mpvCommand(["cycle", "mute"]);
          break;
        case "n":
        case "N":
          saveNow();
          cb.current.onNext();
          break;
        case "p":
        case "P":
          saveNow();
          cb.current.onPrev();
          break;
        case "Escape":
          saveNow();
          cb.current.onClose();
          break;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearInterval(save);
      if (poll) window.clearInterval(poll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      unNav.forEach((u) => u());
      saveNow();
      if (unlisten) unlisten();
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
          <span className="player-hint">Move the mouse to the bottom for controls · Esc to go back</span>
        </div>
      </div>
    </div>
  );
}
