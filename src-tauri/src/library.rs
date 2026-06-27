//! Library scanning: walk configured folders for video files.

use serde::Serialize;
use std::path::Path;
use walkdir::WalkDir;

const VIDEO_EXTS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "webm", "flv", "m4v", "mpg", "mpeg", "ts", "m2ts",
];

#[derive(Debug, Clone, Serialize)]
pub struct VideoFile {
    pub path: String,
    pub title: String,
    pub ext: String,
    pub size: u64,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Folder {
    pub path: String,
    pub name: String,
    pub videos: Vec<VideoFile>,
}

fn is_video(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn title_from(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

fn scan_folder(root: &str) -> Folder {
    let mut videos = Vec::new();
    for entry in WalkDir::new(root)
        .max_depth(8)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let p = entry.path();
        if !p.is_file() || !is_video(p) {
            continue;
        }
        let meta = entry.metadata().ok();
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        videos.push(VideoFile {
            path: p.to_string_lossy().to_string(),
            title: title_from(p),
            ext: p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase(),
            size,
            modified,
        });
    }
    videos.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

    let name = Path::new(root)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(root)
        .to_string();

    Folder {
        path: root.to_string(),
        name,
        videos,
    }
}

/// Scan all configured folders.
pub fn scan(folders: &[String]) -> Vec<Folder> {
    folders.iter().map(|f| scan_folder(f)).collect()
}
