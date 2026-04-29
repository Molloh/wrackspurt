mod sidecar;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            sidecar::start(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running wrackspurt application");
}
