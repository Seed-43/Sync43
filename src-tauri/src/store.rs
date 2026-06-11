// ============================================================
//  Sync43 — state store
//  The frontend keeps the app state (projects, policies,
//  settings, file records) as one JSON document. We persist it
//  atomically to the OS app-config directory:
//    Windows: %APPDATA%/com.seed43.sync43/state.json
//    Linux:   ~/.config/com.seed43.sync43/state.json
//    macOS:   ~/Library/Application Support/com.seed43.sync43/state.json
// ============================================================

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const STATE_FILE: &str = "state.json";

fn state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Could not resolve app config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create config dir: {e}"))?;
    Ok(dir.join(STATE_FILE))
}

pub fn read_state(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = state_path(app)?;
    if !path.exists() {
        return Ok(serde_json::Value::Null);
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("Could not read state: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("State file is corrupted: {e}"))
}

pub fn write_state(app: &tauri::AppHandle, state: &serde_json::Value) -> Result<(), String> {
    let path = state_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    // Write to a temp file first, then rename — so a crash mid-write
    // can never corrupt the existing state file.
    fs::write(&tmp, text).map_err(|e| format!("Could not write state: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Could not finalise state: {e}"))?;
    Ok(())
}
