import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowLeft, Minus, Square, X } from "lucide-react";

interface Props {
  playingTitle?: string | null;
  onClosePlayer?: () => void;
}

export function TitleBar({ playingTitle, onClosePlayer }: Props) {
  const win = getCurrentWindow();
  return (
    <div className="titlebar">
      {playingTitle ? (
        <div className="titlebar-drag" data-tauri-drag-region>
          <button className="tb-back" onClick={onClosePlayer} title="Back to library">
            <ArrowLeft size={16} />
            <span>Library</span>
          </button>
          <span className="tb-playing" title={playingTitle}>
            {playingTitle}
          </span>
        </div>
      ) : (
        <div className="titlebar-drag" data-tauri-drag-region>
          <span className="brand-dot" />
          <span className="brand">Vespera</span>
        </div>
      )}
      <div className="win-btns">
        <button className="win-btn" onClick={() => win.minimize()} title="Minimize">
          <Minus size={16} />
        </button>
        <button className="win-btn" onClick={() => win.toggleMaximize()} title="Maximize">
          <Square size={13} />
        </button>
        <button className="win-btn close" onClick={() => win.close()} title="Close">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
