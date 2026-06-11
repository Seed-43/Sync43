// ============================================================
//  Sync43 — file system operations
//  Folder scanning, project folder creation, and the publish
//  pipeline (archive old version → replace with new).
// ============================================================

use chrono::{DateTime, Local};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

// ------------------------------------------------------------
//  Folder structure scan (used by "Clone Folder Structure")
//  Returns relative directory paths up to two levels deep,
//  e.g. ["Architecture/Plans", "Structure/Foundations"].
// ------------------------------------------------------------
pub fn scan_structure(path: &str) -> Result<Vec<String>, String> {
    let root = Path::new(path);
    if !root.is_dir() {
        return Err("Selected path is not a folder".into());
    }
    let mut out = Vec::new();
    let level1 = read_dirs(root)?;
    for d1 in &level1 {
        let name1 = file_name(d1);
        if name1.starts_with('.') {
            continue; // skip hidden folders
        }
        let level2 = read_dirs(d1).unwrap_or_default();
        let mut had_child = false;
        for d2 in &level2 {
            let name2 = file_name(d2);
            if name2.starts_with('.') {
                continue;
            }
            out.push(format!("{name1}/{name2}"));
            had_child = true;
        }
        if !had_child {
            out.push(name1.clone());
        }
    }
    out.sort();
    Ok(out)
}

fn read_dirs(path: &Path) -> Result<Vec<PathBuf>, String> {
    let mut dirs = Vec::new();
    for entry in fs::read_dir(path).map_err(|e| format!("Could not read folder: {e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_dir() {
            dirs.push(entry.path());
        }
    }
    Ok(dirs)
}

fn file_name(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

// ------------------------------------------------------------
//  Project folder creation
//  Creates <base>/<project name>/<each folder> on disk and
//  returns the project root path.
// ------------------------------------------------------------
pub fn create_project(base: &str, name: &str, folders: &[String]) -> Result<String, String> {
    let safe_name = sanitise(name);
    if safe_name.is_empty() {
        return Err("Project name is empty".into());
    }
    let root = Path::new(base).join(&safe_name);
    fs::create_dir_all(&root).map_err(|e| format!("Could not create project folder: {e}"))?;
    for folder in folders {
        let safe = sanitise(folder);
        if safe.is_empty() {
            continue;
        }
        fs::create_dir_all(root.join(&safe))
            .map_err(|e| format!("Could not create folder '{folder}': {e}"))?;
    }
    Ok(root.to_string_lossy().to_string())
}

/// Strip characters that are illegal in Windows folder names.
fn sanitise(name: &str) -> String {
    name.trim()
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .collect::<String>()
        .trim_end_matches('.')
        .to_string()
}

// ------------------------------------------------------------
//  File stat (size + modified date for the file table)
// ------------------------------------------------------------
#[derive(Serialize)]
pub struct FileStat {
    pub size: String,
    pub modified: String,
}

pub fn stat(path: &str) -> Result<FileStat, String> {
    let meta = fs::metadata(path).map_err(|e| format!("Could not read file: {e}"))?;
    if !meta.is_file() {
        return Err("Not a file".into());
    }
    let modified = meta
        .modified()
        .map(|t| {
            let dt: DateTime<Local> = t.into();
            dt.format("%-d/%m/%Y %H:%M").to_string()
        })
        .unwrap_or_else(|_| "—".into());
    Ok(FileStat {
        size: human_size(meta.len()),
        modified,
    })
}

fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit = 0;
    while size >= 1024.0 && unit < UNITS.len() - 1 {
        size /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{:.1} {}", size, UNITS[unit])
    }
}

// ------------------------------------------------------------
//  Publish pipeline
//
//  1. Destination is <project>/<folder>/<filename>.
//  2. If a previous version exists there and archiving is on:
//     it is MOVED into <project>/<folder>/Versions/ (created on
//     first use) and renamed using the user's pattern, with the
//     date the OLD file was published (its modified date).
//     e.g. file001.rvt  →  Versions/260611_file001.rvt
//  3. The new file is copied from the linked source into place.
// ------------------------------------------------------------
#[derive(Serialize)]
pub struct PublishResult {
    pub dest: String,
    /// Name of the archived previous version, if one was made.
    pub archived: Option<String>,
}

pub fn publish(
    source: &str,
    project_path: &str,
    folder: &str,
    archive: bool,
    date_format: &str,
    name_pattern: &str,
) -> Result<PublishResult, String> {
    let src = Path::new(source);
    if source.is_empty() || !src.is_file() {
        return Err("Linked source file not found — re-link the file and try again".into());
    }
    let file_name = file_name(src);

    let folder_dir = Path::new(project_path).join(sanitise(folder));
    fs::create_dir_all(&folder_dir)
        .map_err(|e| format!("Could not open project folder: {e}"))?;
    let dest = folder_dir.join(&file_name);

    // ---- Archive the existing version first ----
    let mut archived_name = None;
    if dest.exists() {
        if archive {
            // The date stamp is when the OLD file was put there (its
            // modified time), not today — per the issued-record design.
            let old_date: DateTime<Local> = fs::metadata(&dest)
                .and_then(|m| m.modified())
                .map(Into::into)
                .unwrap_or_else(|_| Local::now());
            let date_str = format_date(date_format, &old_date);
            let archived = name_pattern
                .replace("{date}", &date_str)
                .replace("{name}", &file_name);

            let versions_dir = folder_dir.join("Versions");
            fs::create_dir_all(&versions_dir)
                .map_err(|e| format!("Could not create Versions folder: {e}"))?;

            // Avoid clobbering if the same name was archived twice in a day.
            let mut target = versions_dir.join(&archived);
            let mut counter = 1;
            while target.exists() {
                let stem = Path::new(&archived)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| archived.clone());
                let ext = Path::new(&archived)
                    .extension()
                    .map(|e| format!(".{}", e.to_string_lossy()))
                    .unwrap_or_default();
                target = versions_dir.join(format!("{stem}_{counter}{ext}"));
                counter += 1;
            }
            fs::rename(&dest, &target)
                .map_err(|e| format!("Could not archive previous version: {e}"))?;
            archived_name = Some(file_name_of(&target));
        } else {
            fs::remove_file(&dest)
                .map_err(|e| format!("Could not replace previous version: {e}"))?;
        }
    }

    // ---- Copy the new version into place ----
    fs::copy(src, &dest).map_err(|e| format!("Could not copy file into project: {e}"))?;

    Ok(PublishResult {
        dest: dest.to_string_lossy().to_string(),
        archived: archived_name,
    })
}

fn file_name_of(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Supports YYYY, YY, MM, DD tokens in any order/punctuation.
fn format_date(fmt: &str, d: &DateTime<Local>) -> String {
    let fmt = if fmt.trim().is_empty() { "YYYYMMDD" } else { fmt };
    fmt.replace("YYYY", &d.format("%Y").to_string())
        .replace("YY", &d.format("%y").to_string())
        .replace("MM", &d.format("%m").to_string())
        .replace("DD", &d.format("%d").to_string())
}
