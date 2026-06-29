import { Film, Play } from "lucide-react";
import type { AnimeMeta, Folder } from "../api";

interface Props {
  folder: Folder;
  meta?: AnimeMeta | null;
  inProgress: boolean;
  onClick: () => void;
}

export function AnimePoster({ folder, meta, inProgress, onClick }: Props) {
  const title = meta?.title ?? folder.name;
  return (
    <button type="button" className="poster" onClick={onClick} title={title} aria-label={`Open ${title}`}>
      <div className="poster-img">
        {meta?.cover ? (
          <img src={meta.cover} alt="" loading="lazy" />
        ) : (
          <div className="poster-ph">
            <Film size={30} />
          </div>
        )}
        <div className="poster-hover">
          <span className="poster-play">
            <Play size={18} fill="currentColor" />
          </span>
        </div>
        {inProgress && <span className="poster-badge">Watching</span>}
        <span className="poster-count">{folder.videos.length}</span>
      </div>
      <div className="poster-title">{title}</div>
      <div className="poster-sub">
        {meta?.format ?? "Local"}
        {meta?.year ? ` · ${meta.year}` : ""}
      </div>
    </button>
  );
}
