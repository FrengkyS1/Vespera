import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
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
import { ControlBar } from "./ControlBar";

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

  // Nav helpers that persist progress before leaving the current file.
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

  // ── Player lifecycle: mpv events, keyboard, progress, sizing ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;
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
    })();

    const save = window.setInterval(saveNow, 5000);
    window.addEventListener("resize", onResize);

    // Keep the native video window matched to the stage through any size change.
    const ro = new ResizeObserver(() => onResize());
    if (stageRef.current) ro.observe(stageRef.current);

    const onKey = (e: KeyboardEvent) => {
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
          handleNext();
          break;
        case "p":
        case "P":
          handlePrev();
          break;
        case "Escape":
          handleBack();
          break;
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
        // Re-place once layout has settled, so the video fills the stage exactly.
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
      <ControlBar title={video.title} onBack={handleBack} onNext={handleNext} onPrev={handlePrev} />
    </div>
  );
}
