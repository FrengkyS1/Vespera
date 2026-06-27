import { useEffect, useState } from "react";
import {
  ArrowLeft,
  FastForward,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import {
  mpvCommand,
  mpvSetDouble,
  onMpvEvent,
} from "../api";

// Renders in the separate always-on-top "controls" window that floats over the
// bottom of the video. It shares the mpv backend, so it drives playback directly
// and reflects state from mpv events. Library navigation (back/next/prev) is
// emitted to the main window.
export function ControlBar() {
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(100);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onMpvEvent((e) => {
      if (e.event !== "property-change") return;
      if (e.name === "time-pos" && typeof e.data === "number") setPos(e.data);
      else if (e.name === "duration" && typeof e.data === "number") setDur(e.data);
      else if (e.name === "pause" && typeof e.data === "boolean") setPaused(e.data);
      else if (e.name === "volume" && typeof e.data === "number") setVolume(Math.round(e.data));
    }).then((u) => (unlisten = u));
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (dur > 0) mpvCommand(["seek", String(frac * dur), "absolute"]);
  };
  const pct = dur > 0 ? (pos / dur) * 100 : 0;

  return (
    <div className="cbar">
      <div className="bar-top">
        <button className="ctrl-btn" onClick={() => emit("vespera://back")} title="Back to library (Esc)">
          <ArrowLeft size={20} />
        </button>
      </div>
      <div className="seek" onClick={seekTo}>
        <div className="fill" style={{ width: `${pct}%` }} />
        <div className="knob" style={{ left: `${pct}%` }} />
      </div>
      <div className="ctrl-row">
        <button className="ctrl-btn" onClick={() => emit("vespera://prev")} title="Previous (P)">
          <SkipBack size={20} />
        </button>
        <button className="ctrl-btn" onClick={() => mpvCommand(["seek", "-10", "relative"])} title="-10s (Z)">
          <Rewind size={20} />
        </button>
        <button className="ctrl-btn play" onClick={() => mpvCommand(["cycle", "pause"])} title="Play / Pause (Space)">
          {paused ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}
        </button>
        <button className="ctrl-btn" onClick={() => mpvCommand(["seek", "10", "relative"])} title="+10s (X)">
          <FastForward size={20} />
        </button>
        <button className="ctrl-btn" onClick={() => emit("vespera://next")} title="Next (N)">
          <SkipForward size={20} />
        </button>
        <span className="time">
          {fmt(pos)} / {fmt(dur)}
        </span>
        <span className="spacer" />
        <div className="vol">
          <Volume2 size={18} />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              mpvSetDouble("volume", v);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function fmt(s: number): string {
  if (!s || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const p = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}
