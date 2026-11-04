// Player actions shared by the two playback windows: the main window
// (PlayerView) and the transparent overlay window (Overlay). Both listen for the
// same keybinds, so the mpv-only transport actions live here to avoid drift.
// The app-level actions (next / prev / fullscreen / close) are handled by each
// window differently and are intentionally *not* covered here.

import { mpvCommand } from "./api";
import type { PlayerAction } from "./keybinds";

/** Run an mpv-only transport action. Returns true if it was handled here. */
export function runTransportAction(action: PlayerAction): boolean {
  switch (action) {
    case "playPause":
      mpvCommand(["cycle", "pause"]);
      return true;
    case "seekBack":
      mpvCommand(["seek", "-5", "relative"]);
      return true;
    case "seekFwd":
      mpvCommand(["seek", "5", "relative"]);
      return true;
    case "seekBackLong":
      mpvCommand(["seek", "-10", "relative"]);
      return true;
    case "seekFwdLong":
      mpvCommand(["seek", "10", "relative"]);
      return true;
    case "volUp":
      mpvCommand(["add", "volume", "5"]);
      return true;
    case "volDown":
      mpvCommand(["add", "volume", "-5"]);
      return true;
    case "mute":
      mpvCommand(["cycle", "mute"]);
      return true;
    case "cycleFit":
      mpvCommand(["cycle-values", "panscan", "1.0", "0.0"]);
      return true;
    default:
      return false; // next / prev / fullscreen — app-level, handled by caller
  }
}
