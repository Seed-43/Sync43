// ============================================================
//  Sync43 — Tauri commands (the bridge the UI calls)
// ============================================================

use crate::{fsops, store};

/// Load the persisted app state (projects, policies, settings,
/// file records). Returns null on first run.
#[tauri::command]
pub fn load_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    store::read_state(&app)
}

/// Persist the whole app state. The frontend debounces this.
#[tauri::command]
pub fn save_state(app: tauri::AppHandle, state: serde_json::Value) -> Result<(), String> {
    store::write_state(&app, &state)
}

/// Scan a real directory two levels deep — used by
/// "Clone Folder Structure" in the Create Project modal.
#[tauri::command]
pub fn scan_folder_structure(path: String) -> Result<Vec<String>, String> {
    fsops::scan_structure(&path)
}

/// Create the project's folder tree on disk; returns the
/// project root path.
#[tauri::command]
pub fn create_project_folders(
    base: String,
    name: String,
    folders: Vec<String>,
) -> Result<String, String> {
    fsops::create_project(&base, &name, &folders)
}

/// Size + modified date for a file (shown in the Dash table).
#[tauri::command]
pub fn file_stat(path: String) -> Result<fsops::FileStat, String> {
    fsops::stat(&path)
}

/// Publish: archive the previous version (if any) into the
/// Versions folder, then copy the linked source into the
/// project folder.
#[tauri::command]
pub fn publish_file(
    source: String,
    project_path: String,
    folder: String,
    archive: bool,
    date_format: String,
    name_pattern: String,
) -> Result<fsops::PublishResult, String> {
    fsops::publish(
        &source,
        &project_path,
        &folder,
        archive,
        &date_format,
        &name_pattern,
    )
}

/// Open a file or folder in the OS file manager.
#[tauri::command]
pub fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Basic app info for the UI (version, OS).
#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> serde_json::Value {
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    serde_json::json!({
        "version": app.package_info().version.to_string(),
        "os": os,
    })
}
