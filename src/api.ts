import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface VideoFile {
  path: string;
  title: string;
  ext: string;
  size: number;
  modified: number;
}

export interface Folder {
  path: string;
  name: string;
  videos: VideoFile[];
}

export interface AppConfig {
  folders: string[];
  default_volume: number;
  accent: string;
  mpv_path: string;
}

export interface Progress {
  position: number;
  duration: number;
  updated: number;
}

export type ProgressMap = Record<string, Progress>;

// ── Config ──
export const getConfig = () => invoke<AppConfig>("get_config");
export const saveConfig = (cfg: AppConfig) => invoke("save_config", { cfg });
export const addFolder = (path: string) => invoke<AppConfig>("add_folder", { path });
export const removeFolder = (path: string) => invoke<AppConfig>("remove_folder", { path });

// ── Library ──
export const scanLibrary = () => invoke<Folder[]>("scan_library");

// ── Progress ──
export const getProgress = () => invoke<ProgressMap>("get_progress");
export const setProgress = (path: string, position: number, duration: number) =>
  invoke("set_progress", { path, position, duration });

// ── Thumbnails ──
export const generateThumbnail = (path: string) =>
  invoke<string>("generate_thumbnail", { path });
export const thumbUrl = (filePath: string) => convertFileSrc(filePath);

// ── AniList metadata ──
export interface AnimeMeta {
  id: number;
  title: string;
  romaji?: string | null;
  english?: string | null;
  cover?: string | null;
  banner?: string | null;
  color?: string | null;
  episodes?: number | null;
  year?: number | null;
  format?: string | null;
}
export const animeMetadata = (path: string, title: string, force = false) =>
  invoke<AnimeMeta | null>("anime_metadata", { path, title, force });

// ── mpv (embedded libmpv via FFI; video renders in a child window) ──
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const mpvStart = (r: Rect) =>
  invoke("mpv_start", { x: r.x, y: r.y, w: r.w, h: r.h });
export const mpvLoad = (path: string, start: number) =>
  invoke("mpv_load", { path, start });
export const mpvResize = (r: Rect) =>
  invoke("mpv_resize", { x: r.x, y: r.y, w: r.w, h: r.h });
export const mpvCommand = (args: string[]) => invoke("mpv_command", { args });
export const mpvSetDouble = (name: string, value: number) =>
  invoke("mpv_set_double", { name, value });
export const mpvStop = () => invoke("mpv_stop");
export const togglePause = () => mpvCommand(["cycle", "pause"]);
export const cursorPos = () => invoke<[number, number]>("cursor_pos");
export const appForeground = () => invoke<boolean>("app_foreground");

export interface MpvEvent {
  event: string;
  name?: string;
  data?: number | boolean | string;
  reason?: number; // end-file reason (0 = EOF)
}

export const onMpvEvent = (cb: (e: MpvEvent) => void): Promise<UnlistenFn> =>
  listen<MpvEvent>("mpv-event", (e) => cb(e.payload));
