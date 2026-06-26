# WARNING: UNDER DEVELOPMENT - DO NOT USE IN PRODUCTION

# Sync43: Construction Data Sync by Seed43

Tauri 2 desktop app. P2P file sync for construction projects.

## Stage 1 (this build): everything local works for real
- Create projects → real folders created on disk at a per-project location
- Clone Folder Structure → scans a real directory
- Link files (real OS picker) → Publish copies them into the project folder
- Republish → previous version moved to `Versions/` named `<date>_<name>`
  (date = when the old file was published; format set in Settings)
- All state (projects, policies, settings, file records) persists in
  the app config dir (`~/.config/com.seed43.sync43/state.json` on Linux,
  `%APPDATA%\com.seed43.sync43\state.json` on Windows)
- System tray: closing the window hides to tray; tray menu to reopen/quit

Stage 2: sign-in (email → key) on free-tier infrastructure.
Stage 3: Iroh P2P sync between machines (see src-tauri/src/sync.rs).

## Build & run (Fedora)
    sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
        libappindicator-gtk3-devel librsvg2-devel
    cargo install tauri-cli --version "^2"
    cd Sync43
    cargo tauri dev        # run in dev mode
    cargo tauri build      # produce installers

## Build & run (Windows)
Install Rust (rustup.rs) + Microsoft C++ Build Tools + WebView2 (preinstalled
on Win 11), then `cargo install tauri-cli --version "^2"` and `cargo tauri dev`.

## UI prototyping without compiling
Open `src/index.html` directly in a browser, the mock layer in `data.js`
kicks in with seed data so every screen works for design iteration.
