mod anilist;
mod config;
mod library;
mod mpv;
mod thumbs;

use config::{AppConfig, ProgressMap};
use library::Folder;
use mpv::MpvState;
use tauri::{AppHandle, Manager, State};

// ── Config ──────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_config() -> AppConfig {
    config::load_config()
}

#[tauri::command]
fn save_config(cfg: AppConfig) -> Result<(), String> {
    config::save_config(&cfg)
}

#[tauri::command]
fn add_folder(path: String) -> Result<AppConfig, String> {
    let mut cfg = config::load_config();
    if !cfg.folders.contains(&path) {
        cfg.folders.push(path);
        config::save_config(&cfg)?;
    }
    Ok(cfg)
}

#[tauri::command]
fn remove_folder(path: String) -> Result<AppConfig, String> {
    let mut cfg = config::load_config();
    cfg.folders.retain(|f| f != &path);
    config::save_config(&cfg)?;
    Ok(cfg)
}

// ── Library ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn scan_library() -> Vec<Folder> {
    let cfg = config::load_config();
    library::scan(&cfg.folders)
}

// ── Watch progress ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_progress() -> ProgressMap {
    config::load_progress()
}

#[tauri::command]
fn set_progress(path: String, position: f64, duration: f64) -> Result<(), String> {
    config::set_progress(&path, position, duration)
}

// ── Thumbnails ──────────────────────────────────────────────────────────────

// Limit concurrent libmpv thumbnail decoders so a large library can't spawn
// hundreds of instances at once.
static THUMB_SEM: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);

// Async + spawn_blocking so the libmpv frame-grab never blocks the UI thread.
#[tauri::command]
async fn generate_thumbnail(path: String) -> Result<String, String> {
    let _permit = THUMB_SEM.acquire().await.map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || thumbs::generate(&path))
        .await
        .map_err(|e| e.to_string())?
}

// ── mpv (embedded libmpv via FFI) ────────────────────────────────────────────

#[tauri::command]
fn mpv_start(x: i32, y: i32, w: i32, h: i32, app: AppHandle, state: State<MpvState>) -> Result<(), String> {
    state.start(&app, mpv::Rect { x, y, w, h })
}

#[tauri::command]
fn mpv_load(path: String, start: f64, state: State<MpvState>) -> Result<(), String> {
    state.load(&path, start)
}

#[tauri::command]
fn mpv_resize(x: i32, y: i32, w: i32, h: i32, app: AppHandle, state: State<MpvState>) -> Result<(), String> {
    state.resize(&app, mpv::Rect { x, y, w, h })
}

#[tauri::command]
fn mpv_command(args: Vec<String>, state: State<MpvState>) -> Result<(), String> {
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    state.command(&refs)
}

#[tauri::command]
fn mpv_set_double(name: String, value: f64, state: State<MpvState>) -> Result<(), String> {
    state.set_double(&name, value)
}

#[tauri::command]
fn mpv_stop(app: AppHandle, state: State<MpvState>) -> Result<(), String> {
    state.stop(&app)
}

/// Global cursor position (physical px) — for the control bar's auto-hide,
/// since the cursor over the native video isn't visible to the webview.
#[tauri::command]
fn cursor_pos() -> (i32, i32) {
    mpv::cursor_pos()
}

/// Whether Vespera (any of its windows) is the foreground app. Gates the
/// floating control bar without hiding it when the player itself has focus.
#[tauri::command]
fn app_foreground() -> bool {
    mpv::app_is_foreground()
}

/// AniList metadata (cover/banner/title) for a folder, cached on disk.
#[tauri::command]
async fn anime_metadata(path: String, title: String, force: bool) -> Option<anilist::AnimeMeta> {
    tauri::async_runtime::spawn_blocking(move || anilist::metadata_for(&path, &title, force))
        .await
        .ok()
        .flatten()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(MpvState::default())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            add_folder,
            remove_folder,
            scan_library,
            get_progress,
            set_progress,
            generate_thumbnail,
            mpv_start,
            mpv_load,
            mpv_resize,
            mpv_command,
            mpv_set_double,
            mpv_stop,
            cursor_pos,
            app_foreground,
            anime_metadata,
        ])
        .setup(|app| {
            let _ = app.get_webview_window("main");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vespera");
}
