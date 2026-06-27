import { useMemo, useState } from "react";
import { ArrowLeft, Play, Search } from "lucide-react";
import type { AnimeMeta, Folder, ProgressMap, VideoFile } from "../api";
import { VideoCard } from "./VideoCard";
import { AnimePoster } from "./AnimePoster";

type FolderMeta = Record<string, AnimeMeta | null | undefined>;

interface Props {
  selection: { kind: "all" } | { kind: "folder"; index: number };
  folders: Folder[];
  folderMeta: FolderMeta;
  progress: ProgressMap;
  onPlay: (v: VideoFile) => void;
  onOpenFolder: (index: number) => void;
  onBack: () => void;
}

export function LibraryView({
  selection,
  folders,
  folderMeta,
  progress,
  onPlay,
  onOpenFolder,
  onBack,
}: Props) {
  const [query, setQuery] = useState("");

  // Hooks must run unconditionally (before any early return).
  const allVideos = useMemo(() => folders.flatMap((f) => f.videos), [folders]);
  const continueRow = useMemo(
    () =>
      allVideos
        .filter((v) => progress[v.path])
        .sort((a, b) => (progress[b.path]?.updated ?? 0) - (progress[a.path]?.updated ?? 0))
        .slice(0, 12),
    [allVideos, progress]
  );

  // ── Folder (anime) detail: banner hero + episode list ──
  if (selection.kind === "folder") {
    const folder = folders[selection.index];
    if (!folder) return <div className="main" />;
    const meta = folderMeta[folder.path];
    const q = query.trim().toLowerCase();
    const eps = q
      ? folder.videos.filter((v) => v.title.toLowerCase().includes(q))
      : folder.videos;

    // Resume target: most recently watched, else first episode.
    const resumeVid =
      folder.videos
        .filter((v) => progress[v.path])
        .sort((a, b) => (progress[b.path]?.updated ?? 0) - (progress[a.path]?.updated ?? 0))[0] ??
      folder.videos[0];

    return (
      <div className="main">
        <div
          className="hero-banner"
          style={meta?.banner ? { backgroundImage: `url(${meta.banner})` } : undefined}
        >
          <div className="hero-scrim" />
          <button className="hero-back" onClick={onBack} title="Back">
            <ArrowLeft size={18} /> Library
          </button>
          <div className="hero-content">
            <h1>{meta?.title ?? folder.name}</h1>
            <div className="hero-meta">
              {[meta?.format, meta?.year, `${folder.videos.length} episodes`]
                .filter(Boolean)
                .join("  ·  ")}
            </div>
            {resumeVid && (
              <button className="hero-play" onClick={() => onPlay(resumeVid)}>
                <Play size={18} fill="currentColor" />
                {progress[resumeVid.path] ? "Resume" : "Play"}
              </button>
            )}
          </div>
        </div>

        <div className="content">
          <div className="row-head">
            <span className="section-h">Episodes</span>
            <div className="search sm">
              <Search size={14} color="var(--muted)" />
              <input placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="grid">
            {eps.map((v) => (
              <VideoCard key={v.path} video={v} progress={progress[v.path]} onPlay={onPlay} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Home: continue-watching row + anime poster grid ──
  const q = query.trim().toLowerCase();
  const shownFolders = folders
    .map((f, i) => ({ f, i }))
    .filter(({ f }) =>
      q ? (folderMeta[f.path]?.title ?? f.name).toLowerCase().includes(q) : true
    );

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h1>My Library</h1>
          <span className="sub">{folders.length} anime · {allVideos.length} episodes</span>
        </div>
        <div className="toolbar">
          <div className="search">
            <Search size={15} color="var(--muted)" />
            <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="content">
        {folders.length === 0 ? (
          <div className="empty">
            <Play size={42} />
            <h2>No anime yet</h2>
            <p>Add a folder from the sidebar — each folder is matched to its anime cover art.</p>
          </div>
        ) : (
          <>
            {continueRow.length > 0 && !q && (
              <>
                <div className="section-h">Continue watching</div>
                <div className="row">
                  {continueRow.map((v) => (
                    <VideoCard key={v.path} video={v} progress={progress[v.path]} onPlay={onPlay} />
                  ))}
                </div>
              </>
            )}
            <div className="section-h">{q ? "Results" : "Anime"}</div>
            <div className="poster-grid">
              {shownFolders.map(({ f, i }) => (
                <AnimePoster
                  key={f.path}
                  folder={f}
                  meta={folderMeta[f.path]}
                  inProgress={f.videos.some((v) => progress[v.path])}
                  onClick={() => onOpenFolder(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
