//! Thumbnail generation via the bundled libmpv, cached on disk.

use crate::config::data_dir;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

fn cache_dir() -> PathBuf {
    let dir = data_dir().join("thumbnails");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn cache_path(video_path: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    video_path.hash(&mut hasher);
    cache_dir().join(format!("{:016x}.png", hasher.finish()))
}

/// Return a cached thumbnail path for `video_path`, generating it (via libmpv)
/// if needed.
pub fn generate(video_path: &str) -> Result<String, String> {
    let out = cache_path(video_path);
    if out.exists() {
        return Ok(out.to_string_lossy().into_owned());
    }
    crate::mpv::make_thumbnail(video_path, &out.to_string_lossy())?;
    Ok(out.to_string_lossy().into_owned())
}
