import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { keyToAction, normalizeKey, type PlayerAction } from "../keybinds";
import { ControlBar } from "./ControlBar";

const BAR_H = 96; // logical px reserved for the control bar (for the hover zone)

// Physical-pixel rect of the video stage. Floor the origin and ceil the size so
// the native video window fully covers the stage (no thin black edge from
// sub-pixel DPI rounding).
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
  const [controlsVisible, setControlsVisible] = useState(true);

  const cb = useRef({ onClose, onNext, onPrev });
  cb.current = { onClose, onNext, onPrev };

  // Latest key→action map, read live by the keydown handler.
  const keyMapRef = useRef(keyToAction(keybinds));
  keyMapRef.current = keyToAction(keybinds);

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
      /* ignore */
    }
  };

  // ── Player lifecycle: mpv events, keyboard, auto-hide, sizing ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let poll: number | undefined;
    const win = getCurrentWindow();
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
        else if (e.name === "pause" && typeof e.data === "boolean") pausedRef.current = e.data;
      });

      // Auto-hide: poll the global cursor (the webview can't see the mouse over
      // the native video). Show the bar on movement or near the bottom; hide it
      // after a short idle. Toggling it resizes the stage, so the video reclaims
      // the space via the ResizeObserver below.
      const scale = await win.scaleFactor().catch(() => 1);
      let lastCur: [number, number] = [-1, -1];
      let lastMove = Date.now();
      poll = window.setInterval(async () => {
        try {
          const [cur, op, os] = await Promise.all([cursorPos(), win.outerPosition(), win.outerSize()]);
          const moved = cur[0] !== lastCur[0] || cur[1] !== lastCur[1];
          lastCur = cur;
          if (moved) lastMove = Date.now();
          const inWindow =
            cur[0] >= op.x && cur[0] <= op.x + os.width && cur[1] >= op.y && cur[1] <= op.y + os.height;
          const barTop = op.y + os.height - Math.round((BAR_H + 52) * scale);
          const inBarZone = inWindow && cur[1] >= barTop;
          const active = Date.now() - lastMove < 2600;
          const want = pausedRef.current || inBarZone || (inWindow && active);
          setControlsVisible((v) => (v === want ? v : want));
        } catch {
          /* window closing */
        }
      }, 150);
    })();

    const save = window.setInterval(saveNow, 5000);
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => onResize());
    if (stageRef.current) ro.observe(stageRef.current);

    const onKey = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreenRef.current) {
          await win.setFullscreen(false).catch(() => {});
          fullscreenRef.current = false;
        } else {
          handleBack();
        }
        return;
      }
      const action = keyMapRef.current[normalizeKey(e.key)];
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case "playPause":
          mpvCommand(["cycle", "pause"]);
          break;
        case "seekBack":
          mpvCommand(["seek", "-5", "relative"]);
          break;
        case "seekFwd":
          mpvCommand(["seek", "5", "relative"]);
          break;
        case "seekBackLong":
          mpvCommand(["seek", "-10", "relative"]);
          break;
        case "seekFwdLong":
          mpvCommand(["seek", "10", "relative"]);
          break;
        case "volUp":
          mpvCommand(["add", "volume", "5"]);
          break;
        case "volDown":
          mpvCommand(["add", "volume", "-5"]);
          break;
        case "mute":
          mpvCommand(["cycle", "mute"]);
          break;
        case "next":
          handleNext();
          break;
        case "prev":
          handlePrev();
          break;
        case "fullscreen":
          await toggleFullscreen();
          break;
        case "cycleFit":
          mpvCommand(["cycle-values", "panscan", "1.0", "0.0"]);
          break;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearInterval(save);
      if (poll) window.clearInterval(poll);
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
      <ControlBar
        title={video.title}
        visible={controlsVisible}
        onBack={handleBack}
        onNext={handleNext}
        onPrev={handlePrev}
        onFullscreen={toggleFullscreen}
      />
    </div>
  );
}
