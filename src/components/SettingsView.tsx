import { useEffect, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type { AppConfig } from "../api";
import { ACTIONS, displayKey, normalizeKey, resolveKeybinds, type PlayerAction } from "../keybinds";

interface Props {
  config: AppConfig;
  onChange: (cfg: AppConfig) => void;
  onAddFolder: () => void;
  onRemoveFolder: (path: string) => void;
}

export function SettingsView({ config, onChange, onAddFolder, onRemoveFolder }: Props) {
  const [capturing, setCapturing] = useState<string | null>(null);
  const binds = resolveKeybinds(config.keybinds);

  // While rebinding, capture the next key press.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key !== "Escape") {
        const key = normalizeKey(e.key);
        const next: Record<string, string> = { ...config.keybinds, [capturing]: key };
        // If another action already owns this key, give it the key being freed up
        // instead of silently leaving two actions bound to the same key.
        const displaced = (Object.keys(binds) as PlayerAction[]).find(
          (id) => id !== capturing && binds[id] === key,
        );
        if (displaced) next[displaced] = binds[capturing as PlayerAction];
        onChange({ ...config, keybinds: next });
      }
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capturing, config, onChange]);

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h1>Settings</h1>
          <span className="sub">Vespera 0.1</span>
        </div>
      </div>

      <div className="content">
        <div className="settings">
          <div className="section-h">Library folders</div>
          {config.folders.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>No folders yet.</p>
          )}
          {config.folders.map((f) => (
            <div className="folder-row" key={f}>
              <span className="path" title={f}>
                {f}
              </span>
              <button className="icon-btn" onClick={() => onRemoveFolder(f)} title="Remove">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button className="btn-ghost" onClick={onAddFolder} style={{ width: "auto", marginTop: 4 }}>
            <Plus size={16} /> Add folder
          </button>

          <div className="section-h">Playback</div>
          <div className="setting">
            <div>
              <div className="label">Default volume</div>
              <div className="desc">Applied when a video starts.</div>
            </div>
            <div className="control" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="range"
                min={0}
                max={100}
                value={config.default_volume}
                onChange={(e) => onChange({ ...config, default_volume: Number(e.target.value) })}
              />
              <span className="time">{config.default_volume}%</span>
            </div>
          </div>

          <div className="setting">
            <div>
              <div className="label">Accent color</div>
              <div className="desc">The luminous highlight.</div>
            </div>
            <div className="control">
              <input
                type="color"
                value={config.accent}
                onChange={(e) => onChange({ ...config, accent: e.target.value })}
              />
            </div>
          </div>

          <div className="section-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Keyboard shortcuts</span>
            <button
              className="btn-ghost"
              style={{ width: "auto", padding: "5px 10px", fontSize: 12 }}
              onClick={() => onChange({ ...config, keybinds: {} })}
              title="Reset all shortcuts to defaults"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>
            Click a shortcut, then press the key you want. Left-click the video to pause; Esc exits
            fullscreen or returns to the library.
          </p>
          {ACTIONS.map((a) => (
            <div className="shortcut" key={a.id}>
              <span>{a.label}</span>
              <button
                className="kbd"
                style={{ cursor: "pointer", minWidth: 64, textAlign: "center" }}
                onClick={() => setCapturing(a.id)}
              >
                {capturing === a.id ? "Press a key…" : displayKey(binds[a.id])}
              </button>
            </div>
          ))}
          <div className="shortcut">
            <span>Back to library</span>
            <span className="kbd">Esc</span>
          </div>
        </div>
      </div>
    </div>
  );
}
