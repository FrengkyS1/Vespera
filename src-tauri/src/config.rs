//! App configuration and watch-progress persistence.
//!
//! Both live as JSON under the platform data dir (e.g. %APPDATA%/Vespera).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// Folders the library scans.
    pub folders: Vec<String>,
    /// Default playback volume (0-100).
    pub default_volume: u32,
    /// UI accent color (hex). Defaults to Vespera amber.
    pub accent: String,
    /// Optional explicit path to mpv.exe; empty = use bundled / PATH.
    pub mpv_path: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            folders: Vec::new(),
            default_volume: 100,
            accent: "#6D5DFC".to_string(),
            mpv_path: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Progress {
    pub position: f64,
    pub duration: f64,
    pub updated: u64, // unix seconds
}

pub type ProgressMap = HashMap<String, Progress>;

/// Resolve and ensure the app data directory exists.
pub fn data_dir() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Vespera");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

fn progress_path() -> PathBuf {
    data_dir().join("progress.json")
}

pub fn load_config() -> AppConfig {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_config(cfg: &AppConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(config_path(), json).map_err(|e| e.to_string())
}

pub fn load_progress() -> ProgressMap {
    std::fs::read_to_string(progress_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_progress(map: &ProgressMap) -> Result<(), String> {
    let json = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(progress_path(), json).map_err(|e| e.to_string())
}

/// Update one entry; clears it once playback is essentially finished.
pub fn set_progress(path: &str, position: f64, duration: f64) -> Result<(), String> {
    let mut map = load_progress();
    let nearly_done = duration > 0.0 && position / duration > 0.95;
    if nearly_done {
        map.remove(path);
    } else if position > 5.0 {
        let updated = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        map.insert(
            path.to_string(),
            Progress { position, duration, updated },
        );
    }
    save_progress(&map)
}
