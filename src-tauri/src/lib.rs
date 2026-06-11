// ============================================================
//  Sync43 — Tauri application shell
//  Sets up the window, system tray, plugins and commands.
// ============================================================

mod commands;
mod fsops;
mod store;
mod sync; // Stage 3: Iroh P2P engine lives here (stubbed for now)

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::load_state,
            commands::save_state,
            commands::scan_folder_structure,
            commands::create_project_folders,
            commands::file_stat,
            commands::publish_file,
            commands::open_path,
            commands::app_info,
        ])
        .setup(|app| {
            // ---- System tray --------------------------------------------
            // Sync43 lives in the tray like Autodesk Desktop Connector:
            // closing the window hides it; the app keeps running.
            let open_item = MenuItem::with_id(app, "open", "Open Sync43", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Sync43", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            TrayIconBuilder::with_id("sync43-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Sync43 — Construction Data Sync")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click on the tray icon brings the window back.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Closing the window hides to tray instead of quitting.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Sync43");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
