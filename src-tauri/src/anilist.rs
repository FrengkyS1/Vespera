//! AniList metadata: match a folder/title to an anime entry and fetch its cover
//! art + banner. Results are cached on disk so we only hit the API once per folder.

use crate::config::data_dir;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimeMeta {
    pub id: i64,
    pub title: String,
    pub romaji: Option<String>,
    pub english: Option<String>,
    pub cover: Option<String>,
    pub banner: Option<String>,
    pub color: Option<String>,
    pub episodes: Option<i64>,
    pub year: Option<i64>,
    pub format: Option<String>,
}

const QUERY: &str = r#"
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    id
    title { romaji english }
    coverImage { extraLarge large color }
    bannerImage
    episodes
    seasonYear
    format
  }
}
"#;

fn cache_path() -> PathBuf {
    data_dir().join("anilist.json")
}

fn load_cache() -> HashMap<String, Option<AnimeMeta>> {
    std::fs::read_to_string(cache_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_cache(map: &HashMap<String, Option<AnimeMeta>>) {
    if let Ok(json) = serde_json::to_string_pretty(map) {
        let _ = std::fs::write(cache_path(), json);
    }
}

// Strip common release noise from a folder name to improve the search hit rate.
fn clean_title(raw: &str) -> String {
    let mut s = raw.to_string();
    for bracket in [('[', ']'), ('(', ')'), ('{', '}')] {
        while let (Some(a), Some(b)) = (s.find(bracket.0), s.find(bracket.1)) {
            if a < b {
                s.replace_range(a..=b, " ");
            } else {
                break;
            }
        }
    }
    let noise = [
        "1080p", "720p", "480p", "2160p", "4k", "bluray", "blu-ray", "bd", "web-dl", "webrip",
        "hevc", "x265", "x264", "h264", "h265", "aac", "flac", "dual audio", "multi", "uncensored",
    ];
    let lower = s.to_lowercase();
    let mut cut = s.len();
    for n in noise {
        if let Some(i) = lower.find(n) {
            cut = cut.min(i);
        }
    }
    s.truncate(cut);
    s.chars()
        .map(|c| if c == '_' || c == '.' { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn search(title: &str) -> Option<AnimeMeta> {
    let body = ureq::json!({ "query": QUERY, "variables": { "search": title } });
    let resp = ureq::post("https://graphql.anilist.co")
        .set("Content-Type", "application/json")
        .set("Accept", "application/json")
        .send_json(body)
        .ok()?;
    let json: Value = resp.into_json().ok()?;
    let m = json.get("data")?.get("Media")?;
    if m.is_null() {
        return None;
    }
    let romaji = m["title"]["romaji"].as_str().map(String::from);
    let english = m["title"]["english"].as_str().map(String::from);
    Some(AnimeMeta {
        id: m["id"].as_i64().unwrap_or(0),
        title: english.clone().or_else(|| romaji.clone()).unwrap_or_else(|| title.to_string()),
        romaji,
        english,
        cover: m["coverImage"]["extraLarge"]
            .as_str()
            .or_else(|| m["coverImage"]["large"].as_str())
            .map(String::from),
        banner: m["bannerImage"].as_str().map(String::from),
        color: m["coverImage"]["color"].as_str().map(String::from),
        episodes: m["episodes"].as_i64(),
        year: m["seasonYear"].as_i64(),
        format: m["format"].as_str().map(String::from),
    })
}

static LOCK: Mutex<()> = Mutex::new(());

/// Cached metadata for a folder. `title` should be the folder name; `force`
/// re-fetches even if a (possibly null) result is cached.
pub fn metadata_for(folder: &str, title: &str, force: bool) -> Option<AnimeMeta> {
    let _guard = LOCK.lock().ok();
    let mut cache = load_cache();
    if !force {
        if let Some(hit) = cache.get(folder) {
            return hit.clone();
        }
    }
    let result = search(&clean_title(title));
    cache.insert(folder.to_string(), result.clone());
    save_cache(&cache);
    result
}
