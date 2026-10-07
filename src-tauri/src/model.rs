use std::collections::BTreeMap;

use chrono::{Duration, Local, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// 計測対象アプリの実行ファイル名（例: "Code.exe"）。大文字小文字は区別しない
    pub target_apps: Vec<String>,
    /// 文字数を追跡するファイル
    pub file_path: Option<String>,
    /// 日付が切り替わる時刻（0:00 からの分）
    pub day_start_minutes: u32,
    /// ファイルを確認する間隔（秒）
    pub poll_seconds: u64,
    /// 空白文字を数えない（改行は常に数えない）
    pub ignore_whitespace: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            target_apps: Vec::new(),
            file_path: None,
            day_start_minutes: 4 * 60,
            poll_seconds: 2,
            ignore_whitespace: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEvent {
    /// epoch ms
    pub t: i64,
    pub added: u64,
    pub removed: u64,
    /// この時点の文字数
    pub total: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DayData {
    pub date: String,
    /// その日に最初に読んだときの文字数
    pub start_total: Option<u64>,
    pub file_events: Vec<FileEvent>,
    /// epoch 分 → その分のキーストローク数
    pub key_minutes: BTreeMap<i64, u32>,
}

impl DayData {
    pub fn new(date: &str) -> Self {
        Self { date: date.to_string(), ..Default::default() }
    }
}

/// 論理日付（切替時刻を考慮した「今日」）
pub fn logical_date(now_ms: i64, day_start_minutes: u32) -> NaiveDate {
    let now = Local.timestamp_millis_opt(now_ms).single().unwrap_or_else(Local::now);
    (now.naive_local() - Duration::minutes(day_start_minutes as i64)).date()
}

/// 論理日付の開始時刻（epoch ms）
pub fn day_start_ms(date: NaiveDate, day_start_minutes: u32) -> i64 {
    let naive = date.and_hms_opt(0, 0, 0).unwrap() + Duration::minutes(day_start_minutes as i64);
    Local
        .from_local_datetime(&naive)
        .earliest()
        .map(|d| d.timestamp_millis())
        // DST の隙間に入った場合は UTC 扱いで近似
        .unwrap_or_else(|| naive.and_utc().timestamp_millis())
}

pub fn counts_char(c: char, ignore_whitespace: bool) -> bool {
    if c == '\n' || c == '\r' {
        return false;
    }
    !(ignore_whitespace && c.is_whitespace())
}

pub fn count_chars(s: &str, ignore_whitespace: bool) -> u64 {
    s.chars().filter(|&c| counts_char(c, ignore_whitespace)).count() as u64
}
