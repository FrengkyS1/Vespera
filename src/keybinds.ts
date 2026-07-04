// Player actions and their (rebindable) default keys.

export type PlayerAction =
  | "playPause"
  | "seekBack"
  | "seekFwd"
  | "seekBackLong"
  | "seekFwdLong"
  | "volUp"
  | "volDown"
  | "mute"
  | "next"
  | "prev"
  | "fullscreen"
  | "cycleFit";

export const ACTIONS: { id: PlayerAction; label: string }[] = [
  { id: "playPause", label: "Play / Pause" },
  { id: "seekBack", label: "Seek back 5s" },
  { id: "seekFwd", label: "Seek forward 5s" },
  { id: "seekBackLong", label: "Seek back 10s" },
  { id: "seekFwdLong", label: "Seek forward 10s" },
  { id: "volUp", label: "Volume up" },
  { id: "volDown", label: "Volume down" },
  { id: "mute", label: "Mute" },
  { id: "next", label: "Next video" },
  { id: "prev", label: "Previous video" },
  { id: "fullscreen", label: "Toggle fullscreen" },
  { id: "cycleFit", label: "Toggle fill / fit (crop bars)" },
];

export const DEFAULT_KEYBINDS: Record<PlayerAction, string> = {
  playPause: " ",
  seekBack: "ArrowLeft",
  seekFwd: "ArrowRight",
  seekBackLong: "z",
  seekFwdLong: "x",
  volUp: "ArrowUp",
  volDown: "ArrowDown",
  mute: "m",
  next: "n",
  prev: "p",
  fullscreen: "f",
  cycleFit: "w",
};

/** Canonicalize a KeyboardEvent.key so 'F' and 'f' match the same binding. */
export function normalizeKey(key: string): string {
  if (key === " ") return " ";
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Merge saved overrides over the defaults. */
export function resolveKeybinds(overrides?: Record<string, string> | null): Record<PlayerAction, string> {
  const merged = { ...DEFAULT_KEYBINDS };
  if (overrides) {
    for (const id of Object.keys(DEFAULT_KEYBINDS) as PlayerAction[]) {
      const v = overrides[id];
      if (v) merged[id] = v;
    }
  }
  return merged;
}

/** Build a key -> action lookup for the keydown handler. */
export function keyToAction(binds: Record<PlayerAction, string>): Record<string, PlayerAction> {
  const map: Record<string, PlayerAction> = {};
  for (const id of Object.keys(binds) as PlayerAction[]) {
    map[normalizeKey(binds[id])] = id;
  }
  return map;
}

/** Human-readable label for a key. */
export function displayKey(key: string): string {
  const names: Record<string, string> = {
    " ": "Space",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Escape: "Esc",
  };
  return names[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}
