import { useEffect, useRef, useState } from "react";
import { LuArrowLeft, LuChevronLeft, LuChevronRight, LuVolume1, LuVolume2, LuVolumeOff } from "react-icons/lu";
import { MdOutlineSubtitles } from "react-icons/md";
import { RiPauseLargeLine, RiPlayLargeLine } from "react-icons/ri";
import { RxEnterFullScreen } from "react-icons/rx";
import {
  emitPlayerAction,
  mpvCommand,
  mpvSetDouble,
  onControlsState,
  onMpvEvent,
} from "../api";
import { keyToAction, normalizeKey, resolveKeybinds, type PlayerAction } from "../keybinds";
import { runTransportAction } from "../playerActions";

// Controls linger this long after the cursor stops before fading out.
const IDLE_MS = 2600;

// The transparent overlay window ("controls"). Modeled 1:1 on Seanime's VideoCore
// control bar: white icons over a soft black gradient, a white scrubber, and a
// hover-expand volume slider. The window is always interactive (it owns every
// click), so keyboard focus never leaks to the native mpv child beneath it.
export function Overlay() {
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [title, setTitle] = useState("");
  const [visible, setVisible] = useState(false);

  const activeRef = useRef(false); // playback in progress
  const hoveringRef = useRef(false); // pointer parked over the control cluster
  const idleRef = useRef(0);
  const keymapRef = useRef(keyToAction(resolveKeybinds()));

  const show = () => setVisible(true);
  const scheduleHide = () => {
    window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => {
      if (!hoveringRef.current) setVisible(false);
    }, IDLE_MS);
  };
  const wake = () => {
    show();
    scheduleHide();
  };
  const hideNow = () => {
    window.clearTimeout(idleRef.current);
    setVisible(false);
  };

  // mpv property stream (broadcast to every window from Rust).
  useEffect(() => {
    let un: (() => void) | undefined;
    onMpvEvent((e) => {
      if (e.event !== "property-change") return;
      if (e.name === "time-pos" && typeof e.data === "number") setPos(e.data);
      else if (e.name === "duration" && typeof e.data === "number") setDur(e.data);
      else if (e.name === "pause" && typeof e.data === "boolean") setPaused(e.data);
      else if (e.name === "volume" && typeof e.data === "number") setVolume(Math.round(e.data));
      else if (e.name === "mute" && typeof e.data === "boolean") setMuted(e.data);
    }).then((u) => (un = u));
    return () => un?.();
  }, []);

  // Activation + metadata pushed from the main window on play / stop.
  useEffect(() => {
    let un: (() => void) | undefined;
    onControlsState((s) => {
      setTitle(s.title);
      keymapRef.current = keyToAction(resolveKeybinds(s.keybinds));
      activeRef.current = s.active;
      if (s.active) wake();
      else hideNow();
    }).then((u) => (un = u));
    return () => un?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard works whichever window holds focus, so mirror the main handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (e.key === "Escape") {
        emitPlayerAction("close");
        return;
      }
      const action = keymapRef.current[normalizeKey(e.key)] as PlayerAction | undefined;
      if (!action) return;
      e.preventDefault();
      wake();
      if (action === "next") emitPlayerAction("next");
      else if (action === "prev") emitPlayerAction("prev");
      else if (action === "fullscreen") emitPlayerAction("fullscreen");
      else runTransportAction(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = dur > 0 ? (pos / dur) * 100 : 0;
  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (dur > 0) mpvCommand(["seek", String(frac * dur), "absolute"]);
  };
  const cluster = {
    onMouseEnter: () => (hoveringRef.current = true),
    onMouseLeave: () => {
      hoveringRef.current = false;
      scheduleHide();
    },
  };
  const Vol = muted || volume <= 0 ? LuVolumeOff : volume < 55 ? LuVolume1 : LuVolume2;

  return (
    <div
      className={`overlay-root${visible ? "" : " vc-idle"}`}
      onMouseMove={wake}
      onMouseLeave={hideNow}
    >
      {/* Click anywhere over the video to toggle pause. */}
      <div className="player-center" onClick={() => mpvCommand(["cycle", "pause"])} />

      <div className={`vc-top ${visible ? "" : "hidden"}`} {...cluster}>
        <button className="vc-btn" onClick={() => emitPlayerAction("close")} title="Back to library (Esc)">
          <LuArrowLeft size={22} />
        </button>
        <span className="vc-title">{title}</span>
      </div>

      <div className={`vc-bottom ${visible ? "" : "hidden"}`} {...cluster}>
        <div className="seek" onClick={seekTo}>
          <div className="fill" style={{ width: `${pct}%` }} />
          <div className="knob" style={{ left: `${pct}%` }} />
        </div>
        <div className="vc-row">
          <button className="vc-btn vc-play" onClick={() => mpvCommand(["cycle", "pause"])} title="Play / Pause (Space)">
            {paused ? <RiPlayLargeLine size={30} /> : <RiPauseLargeLine size={30} />}
          </button>
          <button className="vc-btn" onClick={() => emitPlayerAction("prev")} title="Previous (P)">
            <LuChevronLeft size={26} />
          </button>
          <button className="vc-btn" onClick={() => emitPlayerAction("next")} title="Next (N)">
            <LuChevronRight size={26} />
          </button>
          <div className="vc-vol">
            <button className="vc-btn" onClick={() => mpvCommand(["cycle", "mute"])} title="Mute (M)">
              <Vol size={24} />
            </button>
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
          <span className="vc-time">
            {fmt(pos)} <span className="vc-time-dim">/ {fmt(dur)}</span>
          </span>
          <span className="vc-spacer" />
          <button className="vc-btn" onClick={() => mpvCommand(["cycle", "sub"])} title="Cycle subtitles">
            <MdOutlineSubtitles size={24} />
          </button>
          <button className="vc-btn" onClick={() => emitPlayerAction("fullscreen")} title="Fullscreen (F)">
            <RxEnterFullScreen size={24} />
          </button>
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
