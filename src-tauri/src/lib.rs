#![allow(dead_code)]

mod error;
mod types;
mod drivers;
mod executor;
mod schema;
mod store;
mod secrets;
mod connections;
mod commands;
mod editing;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // App database lives in the OS app-data dir; create it on first run.
            let dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&dir).ok();
            let db_path = dir.join("mamasql.db");
            let store = tauri::async_runtime::block_on(store::Store::open(
                db_path.to_str().expect("app data path is valid UTF-8"),
            ))
            .expect("open app store");
            app.manage(commands::AppState {
                registry: connections::ConnectionRegistry::new(),
                store,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::list_connections,
            commands::save_connection,
            commands::delete_connection,
            commands::test_connection,
            commands::open_connection,
            commands::close_connection,
            commands::run_query,
            commands::list_tables,
            commands::list_columns,
            commands::recent_history,
            commands::update_cell,
            commands::delete_row,
            commands::insert_row,
            commands::drop_table,
            commands::create_table,
            commands::add_column,
            commands::drop_column,
            commands::rename_column,
            commands::rename_table,
            commands::create_local_database,
            commands::scan_local_databases,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
