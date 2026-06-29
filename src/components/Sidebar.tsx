import { Clapperboard, Folder as FolderIcon, Plus, Settings } from "lucide-react";
import type { Folder } from "../api";
import { VesperaMark } from "./Logo";

export type Selection =
  | { kind: "all" }
  | { kind: "folder"; index: number }
  | { kind: "settings" };

interface Props {
  folders: Folder[];
  totalVideos: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAddFolder: () => void;
}

export function Sidebar({ folders, totalVideos, selection, onSelect, onAddFolder }: Props) {
  const isAll = selection.kind === "all";
  const isSettings = selection.kind === "settings";

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <VesperaMark className="mark" size={30} />
        <span className="name">Vespera</span>
      </div>

      <div className="side-label">Library</div>
      <button
        className={`nav-item ${isAll ? "active" : ""}`}
        onClick={() => onSelect({ kind: "all" })}
      >
        <Clapperboard size={17} />
        <span>All Videos</span>
        <span className="count">{totalVideos}</span>
      </button>

      {folders.length > 0 && <div className="side-label">Folders</div>}
      {folders.map((f, i) => (
        <button
          key={f.path}
          className={`nav-item ${selection.kind === "folder" && selection.index === i ? "active" : ""}`}
          onClick={() => onSelect({ kind: "folder", index: i })}
          title={f.path}
        >
          <FolderIcon size={17} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {f.name}
          </span>
          <span className="count">{f.videos.length}</span>
        </button>
      ))}

      <div className="side-spacer" />

      <button
        className={`btn-ghost ${isSettings ? "active" : ""}`}
        onClick={() => onSelect({ kind: "settings" })}
        style={isSettings ? { color: "var(--accent)" } : undefined}
      >
        <Settings size={17} />
        <span>Settings</span>
      </button>
      <button className="btn-primary" style={{ marginTop: 8 }} onClick={onAddFolder}>
        <Plus size={17} />
        <span>Add Folder</span>
      </button>
    </aside>
  );
}
