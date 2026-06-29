import { useEffect, useState } from "react";
import { Film, Play } from "lucide-react";
import { generateThumbnail, thumbUrl, type Progress, type VideoFile } from "../api";

interface Props {
  video: VideoFile;
  progress?: Progress;
  onPlay: (v: VideoFile) => void;
}

export function VideoCard({ video, progress, onPlay }: Props) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    generateThumbnail(video.path)
      .then((p) => alive && setThumb(thumbUrl(p)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [video.path]);

  const pct =
    progress && progress.duration > 0
      ? Math.min(100, (progress.position / progress.duration) * 100)
      : 0;

  return (
    <button type="button" className="card" onClick={() => onPlay(video)} title={video.title} aria-label={`Play ${video.title}`}>
      <div className="thumb">
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Film className="ph" size={36} />}
      </div>
      <span className="ext-badge">{video.ext.toUpperCase()}</span>
      <div className="scrim" />
      <div className="play">
        <span className="play-badge">
          <Play size={22} fill="currentColor" />
        </span>
      </div>
      <div className="card-info">
        <div className="card-title">{video.title}</div>
        <div className="card-meta">{formatSize(video.size)}</div>
      </div>
      {pct > 0 && (
        <div className="resume">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </button>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}
