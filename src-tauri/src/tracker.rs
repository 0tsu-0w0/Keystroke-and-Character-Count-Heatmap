use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};

use crate::diff::char_diff;
use crate::model::{count_chars, day_start_ms, logical_date, DayData, FileEvent, Settings};

const RECENT_APPS_MAX: usize = 15;

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub struct Core {
    pub data_dir: PathBuf,
    pub settings: Settings,
    pub day: DayData,
    pub day_dirty: bool,
    /// 直近 60 秒のキー押下時刻（ms）
    pub recent_keys: VecDeque<i64>,
    pub focused_app: Option<String>,
    pub recent_apps: Vec<String>,
    pub file_error: Option<String>,
    pub file_total: Option<u64>,
    pub listener_error: Option<String>,
}

impl Core {
    fn day_path(&self, date: &str) -> PathBuf {
        self.data_dir.join("days").join(format!("{date}.json"))
    }

    fn load_day(&self, date: &str) -> DayData {
        fs::read_to_string(self.day_path(date))
            .ok()
            .and_then(|s| serde_json::from_str::<DayData>(&s).ok())
            .unwrap_or_else(|| DayData::new(date))
    }

    pub fn save_day(&mut self) {
        if !self.day_dirty {
            return;
        }
        let path = self.day_path(&self.day.date);
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string(&self.day) {
            if write_atomic(&path, json.as_bytes()).is_ok() {
                self.day_dirty = false;
            }
        }
    }

    pub fn save_settings(&self) -> std::io::Result<()> {
        fs::create_dir_all(&self.data_dir)?;
        let json = serde_json::to_string_pretty(&self.settings).unwrap_or_default();
        write_atomic(&self.data_dir.join("settings.json"), json.as_bytes())
    }

    /// 論理日付が変わっていたら日データを切り替える
    pub fn ensure_day(&mut self, now: i64) {
        let date = logical_date(now, self.settings.day_start_minutes).to_string();
        if self.day.date != date {
            self.save_day();
            self.day = self.load_day(&date);
            if self.day.start_total.is_none() {
                self.day.start_total = self.file_total;
                self.day_dirty = true;
            }
        }
    }

    pub fn is_target_focused(&self) -> bool {
        let Some(app) = &self.focused_app else { return false };
        self.settings
            .target_apps
            .iter()
            .any(|t| t.trim().eq_ignore_ascii_case(app))
    }

    pub fn record_key(&mut self, now: i64) {
        self.ensure_day(now);
        *self.day.key_minutes.entry(now.div_euclid(60_000)).or_insert(0) += 1;
        self.day_dirty = true;
        self.recent_keys.push_back(now);
        self.prune_keys(now);
    }

    pub fn prune_keys(&mut self, now: i64) {
        while self.recent_keys.front().is_some_and(|&t| t <= now - 60_000) {
            self.recent_keys.pop_front();
        }
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

pub type Shared = Arc<Mutex<Core>>;

pub fn init(data_dir: PathBuf) -> Shared {
    let settings = fs::read_to_string(data_dir.join("settings.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .unwrap_or_default();
    let mut core = Core {
        data_dir,
        settings,
        day: DayData::new(""),
        day_dirty: false,
        recent_keys: VecDeque::new(),
        focused_app: None,
        recent_apps: Vec::new(),
        file_error: None,
        file_total: None,
        listener_error: None,
    };
    core.ensure_day(now_ms());
    Arc::new(Mutex::new(core))
}

// ───────────── キーボード ─────────────

pub fn spawn_key_listener(core: Shared, focused: Arc<AtomicBool>) {
    thread::spawn(move || {
        let held: Mutex<Vec<rdev::Key>> = Mutex::new(Vec::new());
        let core_cb = core.clone();
        let result = rdev::listen(move |event| match event.event_type {
            rdev::EventType::KeyPress(key) => {
                let mut held = held.lock().unwrap();
                // 押しっぱなしによるオートリピートは数えない
                if held.contains(&key) {
                    return;
                }
                held.push(key);
                if focused.load(Ordering::Relaxed) {
                    if let Ok(mut c) = core_cb.lock() {
                        c.record_key(now_ms());
                    }
                }
            }
            rdev::EventType::KeyRelease(key) => {
                held.lock().unwrap().retain(|k| *k != key);
            }
            _ => {}
        });
        if let Err(e) = result {
            if let Ok(mut c) = core.lock() {
                c.listener_error = Some(format!("キーボードフックを開始できませんでした: {e:?}"));
            }
        }
    });
}

// ───────────── フォーカス ─────────────

pub fn spawn_focus_watcher(core: Shared, focused: Arc<AtomicBool>) {
    let own_pid = std::process::id() as u64;
    thread::spawn(move || loop {
        let app = active_win_pos_rs::get_active_window().ok().and_then(|w| {
            let exe = w
                .process_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or(w.app_name.clone());
            Some((exe, w.process_id == own_pid))
        });
        if let Ok(mut c) = core.lock() {
            match app {
                Some((exe, is_self)) => {
                    if !is_self {
                        c.recent_apps.retain(|a| !a.eq_ignore_ascii_case(&exe));
                        c.recent_apps.insert(0, exe.clone());
                        c.recent_apps.truncate(RECENT_APPS_MAX);
                    }
                    c.focused_app = Some(exe);
                }
                None => c.focused_app = None,
            }
            focused.store(c.is_target_focused(), Ordering::Relaxed);
        }
        thread::sleep(Duration::from_millis(250));
    });
}

// ───────────── ファイル ─────────────

#[derive(Serialize, Deserialize)]
struct Snapshot {
    path: String,
    saved_ms: i64,
    text: String,
}

fn read_text(path: &str) -> std::io::Result<String> {
    let bytes = fs::read(path)?;
    let text = String::from_utf8_lossy(&bytes);
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
    Ok(text.replace("\r\n", "\n"))
}

pub fn spawn_file_watcher(core: Shared) {
    thread::spawn(move || {
        let snapshot_path = core.lock().unwrap().data_dir.join("snapshot.json");
        // 前回終了時のテキストを読み込み、アプリを閉じていた間の変化も今日の分なら数える
        let mut prev: Option<(String, String)> = fs::read_to_string(&snapshot_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Snapshot>(&s).ok())
            .filter(|snap| {
                let c = core.lock().unwrap();
                let start = day_start_ms(
                    logical_date(now_ms(), c.settings.day_start_minutes),
                    c.settings.day_start_minutes,
                );
                snap.saved_ms >= start
            })
            .map(|s| (s.path, s.text));
        let mut last_stamp: Option<(String, SystemTime, u64, bool)> = None;
        let mut last_poll = 0i64;
        let mut last_ignore_ws: Option<bool> = None;

        loop {
            let now = now_ms();
            let (path, poll_ms, ignore_ws) = {
                let mut c = core.lock().unwrap();
                c.ensure_day(now);
                c.prune_keys(now);
                c.save_day();
                (
                    c.settings.file_path.clone().filter(|p| !p.trim().is_empty()),
                    c.settings.poll_seconds.max(1) as i64 * 1000,
                    c.settings.ignore_whitespace,
                )
            };

            if now - last_poll >= poll_ms {
                last_poll = now;
                match path {
                    None => {
                        let mut c = core.lock().unwrap();
                        c.file_error = None;
                        c.file_total = None;
                    }
                    Some(path) => {
                        // 数え方を変えたら、それ以降の基準を作り直す
                        if last_ignore_ws != Some(ignore_ws) {
                            if last_ignore_ws.is_some() {
                                last_stamp = None;
                            }
                            last_ignore_ws = Some(ignore_ws);
                        }
                        let meta = fs::metadata(&path);
                        let stamp = meta
                            .as_ref()
                            .ok()
                            .map(|m| (path.clone(), m.modified().unwrap_or(SystemTime::UNIX_EPOCH), m.len(), ignore_ws));
                        if stamp.is_some() && stamp == last_stamp {
                            // 変化なし
                        } else {
                            match read_text(&path) {
                                Err(e) => {
                                    let mut c = core.lock().unwrap();
                                    c.file_error = Some(format!("ファイルを読めません: {e}"));
                                }
                                Ok(text) => {
                                    last_stamp = stamp;
                                    process_text(&core, &path, text, &mut prev, ignore_ws, &snapshot_path);
                                }
                            }
                        }
                    }
                }
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
}

fn process_text(
    core: &Shared,
    path: &str,
    text: String,
    prev: &mut Option<(String, String)>,
    ignore_ws: bool,
    snapshot_path: &Path,
) {
    let total = count_chars(&text, ignore_ws);
    let diff = match prev.as_ref() {
        Some((p, old)) if p.as_str() == path => {
            if *old == text {
                None
            } else {
                Some(char_diff(old, &text, ignore_ws))
            }
        }
        // 初回、またはファイルが切り替わった: 差分は取らず基準にする
        _ => None,
    };
    let changed = prev.as_ref().map_or(true, |(p, old)| p.as_str() != path || *old != text);

    {
        let now = now_ms();
        let mut c = core.lock().unwrap();
        c.ensure_day(now);
        c.file_error = None;
        c.file_total = Some(total);
        if c.day.start_total.is_none() {
            c.day.start_total = Some(total);
            c.day_dirty = true;
        }
        if let Some((added, removed)) = diff {
            if added > 0 || removed > 0 {
                c.day.file_events.push(FileEvent { t: now, added, removed, total });
                c.day_dirty = true;
                c.save_day();
            }
        }
    }

    if changed {
        let snap = Snapshot { path: path.to_string(), saved_ms: now_ms(), text: text.clone() };
        if let Ok(json) = serde_json::to_string(&snap) {
            let _ = write_atomic(snapshot_path, json.as_bytes());
        }
        *prev = Some((path.to_string(), text));
    }
}
