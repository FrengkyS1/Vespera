import { Plus, Trash2 } from "lucide-react";
import type { AppConfig } from "../api";

interface Props {
  config: AppConfig;
  onChange: (cfg: AppConfig) => void;
  onAddFolder: () => void;
  onRemoveFolder: (path: string) => void;
}

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / Pause"],
  ["← / →", "Seek 5 seconds"],
  ["Z / X", "Seek 10 seconds"],
  ["↑ / ↓", "Volume"],
  ["N / P", "Next / Previous video"],
  ["M", "Mute"],
  ["Esc", "Back to library"],
];

export function SettingsView({ config, onChange, onAddFolder, onRemoveFolder }: Props) {
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
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
              No folders yet.
            </p>
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
                onChange={(e) =>
                  onChange({ ...config, default_volume: Number(e.target.value) })
                }
              />
              <span className="time">{config.default_volume}%</span>
            </div>
          </div>

          <div className="setting">
            <div>
              <div className="label">Accent color</div>
              <div className="desc">The luminous amber highlight.</div>
            </div>
            <div className="control">
              <input
                type="color"
                value={config.accent}
                onChange={(e) => onChange({ ...config, accent: e.target.value })}
              />
            </div>
          </div>

          <div className="section-h">Keyboard shortcuts</div>
          {SHORTCUTS.map(([k, label]) => (
            <div className="shortcut" key={k}>
              <span>{label}</span>
              <span className="kbd">{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
