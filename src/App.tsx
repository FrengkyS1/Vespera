import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  addFolder as apiAddFolder,
  animeMetadata,
  getConfig,
  getProgress,
  removeFolder as apiRemoveFolder,
  saveConfig,
  scanLibrary,
  type AnimeMeta,
  type AppConfig,
  type Folder,
  type ProgressMap,
  type VideoFile,
} from "./api";
import { TitleBar } from "./components/TitleBar";
import { Sidebar, type Selection } from "./components/Sidebar";
import { LibraryView } from "./components/LibraryView";
import { SettingsView } from "./components/SettingsView";
import { PlayerView } from "./components/PlayerView";

export function App() {
  const [config, setConfig] = useState<AppConfig>({
    folders: [],
    default_volume: 100,
    accent: "#6d5dfc",
    mpv_path: "",
  });
  const [folders, setFolders] = useState<Folder[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [nowPlaying, setNowPlaying] = useState<VideoFile | null>(null);
  const [folderMeta, setFolderMeta] = useState<Record<string, AnimeMeta | null | undefined>>({});

  const refreshLibrary = useCallback(async () => {
    setFolders(await scanLibrary());
    setProgress(await getProgress());
  }, []);

  useEffect(() => {
    // Recover from any stuck fullscreen state on launch.
    getCurrentWindow().setFullscreen(false).catch(() => {});
    (async () => {
      setConfig(await getConfig());
      await refreshLibrary();
    })();
  }, [refreshLibrary]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", config.accent);
  }, [config.accent]);

  // Fetch AniList cover art / banners per folder (cached on disk by the backend).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const f of folders) {
        if (folderMeta[f.path] !== undefined) continue;
        const m = await animeMetadata(f.path, f.name).catch(() => null);
        if (cancelled) return;
        setFolderMeta((prev) => ({ ...prev, [f.path]: m }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folders]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateConfig = useCallback((cfg: AppConfig) => {
    setConfig(cfg);
    saveConfig(cfg);
  }, []);

  const handleAddFolder = useCallback(async () => {
    const picked = await open({ directory: true, multiple: true });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    let cfg: AppConfig | null = null;
    for (const p of paths) cfg = await apiAddFolder(p);
    if (cfg) setConfig(cfg);
    await refreshLibrary();
  }, [refreshLibrary]);

  const handleRemoveFolder = useCallback(
    async (path: string) => {
      const cfg = await apiRemoveFolder(path);
      setConfig(cfg);
      await refreshLibrary();
    },
    [refreshLibrary]
  );

  const closePlayer = useCallback(async () => {
    setNowPlaying(null);
    setProgress(await getProgress()); // refresh resume bars
  }, []);

  // Navigating in the sidebar leaves the player.
  const handleSelect = useCallback(
    (s: Selection) => {
      if (nowPlaying) setNowPlaying(null);
      setSelection(s);
    },
    [nowPlaying]
  );

  const allVideos = useMemo(() => folders.flatMap((f) => f.videos), [folders]);
  const visible = useMemo(() => {
    if (selection.kind === "folder") return folders[selection.index]?.videos ?? [];
    return allVideos;
  }, [selection, folders, allVideos]);

  // Autoplay / next / previous within the list being browsed.
  const playNext = useCallback(() => {
    setNowPlaying((cur) => {
      if (!cur) return cur;
      const idx = visible.findIndex((v) => v.path === cur.path);
      const next = idx >= 0 ? visible[idx + 1] : undefined;
      if (!next) {
        getProgress().then(setProgress);
        return null; // end of list → back to library
      }
      return next;
    });
  }, [visible]);
  const playPrev = useCallback(() => {
    setNowPlaying((cur) => {
      if (!cur) return cur;
      const idx = visible.findIndex((v) => v.path === cur.path);
      return idx > 0 ? visible[idx - 1] : cur;
    });
  }, [visible]);

  // During playback the player takes the whole window (no title bar / sidebar).
  if (nowPlaying) {
    return (
      <div className="app">
        <PlayerView
          video={nowPlaying}
          resume={progress[nowPlaying.path]}
          defaultVolume={config.default_volume}
          onClose={closePlayer}
          onNext={playNext}
          onPrev={playPrev}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="body">
        <Sidebar
          folders={folders}
          totalVideos={allVideos.length}
          selection={selection}
          onSelect={handleSelect}
          onAddFolder={handleAddFolder}
        />
        {selection.kind === "settings" ? (
          <SettingsView
            config={config}
            onChange={updateConfig}
            onAddFolder={handleAddFolder}
            onRemoveFolder={handleRemoveFolder}
          />
        ) : (
          <LibraryView
            selection={selection}
            folders={folders}
            folderMeta={folderMeta}
            progress={progress}
            onPlay={setNowPlaying}
            onOpenFolder={(index) => setSelection({ kind: "folder", index })}
            onBack={() => setSelection({ kind: "all" })}
          />
        )}
      </div>
    </div>
  );
}
