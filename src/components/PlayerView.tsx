import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
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

// Physical-pixel rect of the video stage (the area above the control bar). Floor
// origin / ceil size so the native video fully covers it (no sub-pixel gap).
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
  const fullscreenRef = useRef(false);
  const wasMaxRef = useRef(false);
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

  // ── Player lifecycle: mpv events, keyboard, sizing ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    const onResize = () => mpvResize(stageRect(stageRef.current));

    (async () => {
      // Fill the screen while watching so the video is as large as possible.
      wasMaxRef.current = await win.isMaximized().catch(() => false);
      if (!wasMaxRef.current) await win.maximize().catch(() => {});

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
        case "playPause": mpvCommand(["cycle", "pause"]); break;
        case "seekBack": mpvCommand(["seek", "-5", "relative"]); break;
        case "seekFwd": mpvCommand(["seek", "5", "relative"]); break;
        case "seekBackLong": mpvCommand(["seek", "-10", "relative"]); break;
        case "seekFwdLong": mpvCommand(["seek", "10", "relative"]); break;
        case "volUp": mpvCommand(["add", "volume", "5"]); break;
        case "volDown": mpvCommand(["add", "volume", "-5"]); break;
        case "mute": mpvCommand(["cycle", "mute"]); break;
        case "next": handleNext(); break;
        case "prev": handlePrev(); break;
        case "fullscreen": await toggleFullscreen(); break;
        case "cycleFit": mpvCommand(["cycle-values", "panscan", "1.0", "0.0"]); break;
      }
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
      if (!wasMaxRef.current) win.unmaximize().catch(() => {});
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
          <span className="player-hint">Press W to fill (crop bars) · F fullscreen · Esc back</span>
        </div>
      </div>
      <ControlBar
        title={video.title}
        onBack={handleBack}
        onNext={handleNext}
        onPrev={handlePrev}
        onFullscreen={toggleFullscreen}
      />
    </div>
  );
}
