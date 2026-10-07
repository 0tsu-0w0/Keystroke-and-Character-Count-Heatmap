mod diff;
mod model;
mod tracker;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use serde::Serialize;
use tauri::{Manager, State};

use model::{day_start_ms, logical_date, FileEvent, Settings};
use tracker::{now_ms, Shared};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    date: String,
    day_start_ms: i64,
    now_ms: i64,
    settings: Settings,
    file_total: Option<u64>,
    file_error: Option<String>,
    start_total: Option<u64>,
    file_events: Vec<FileEvent>,
    /// [epoch 分, 回数]
    key_minutes: Vec<(i64, u32)>,
    kpm_now: u32,
    focused_app: Option<String>,
    target_focused: bool,
    recent_apps: Vec<String>,
    listener_error: Option<String>,
}

#[tauri::command]
fn get_snapshot(core: State<'_, Shared>) -> Snapshot {
    let now = now_ms();
    let mut c = core.lock().unwrap();
    c.ensure_day(now);
    c.prune_keys(now);
    let date = logical_date(now, c.settings.day_start_minutes);
    Snapshot {
        date: date.to_string(),
        day_start_ms: day_start_ms(date, c.settings.day_start_minutes),
        now_ms: now,
        settings: c.settings.clone(),
        file_total: c.file_total,
        file_error: c.file_error.clone(),
        start_total: c.day.start_total,
        file_events: c.day.file_events.clone(),
        key_minutes: c.day.key_minutes.iter().map(|(k, v)| (*k, *v)).collect(),
        kpm_now: c.recent_keys.len() as u32,
        focused_app: c.focused_app.clone(),
        target_focused: c.is_target_focused(),
        recent_apps: c.recent_apps.clone(),
        listener_error: c.listener_error.clone(),
    }
}

#[tauri::command]
fn save_settings(core: State<'_, Shared>, settings: Settings) -> Result<(), String> {
    let mut c = core.lock().unwrap();
    let mut s = settings;
    s.day_start_minutes %= 24 * 60;
    s.poll_seconds = s.poll_seconds.clamp(1, 60);
    s.target_apps = s
        .target_apps
        .into_iter()
        .map(|a| a.trim().to_string())
        .filter(|a| !a.is_empty())
        .collect();
    c.settings = s;
    c.ensure_day(now_ms());
    c.save_settings().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let core = tracker::init(data_dir);
            let focused = Arc::new(AtomicBool::new(false));
            tracker::spawn_focus_watcher(core.clone(), focused.clone());
            tracker::spawn_key_listener(core.clone(), focused);
            tracker::spawn_file_watcher(core.clone());
            app.manage(core);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(core) = window.try_state::<Shared>() {
                    if let Ok(mut c) = core.lock() {
                        c.save_day();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_snapshot, save_settings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
