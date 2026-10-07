use std::time::{Duration, Instant};

use similar::{Algorithm, ChangeTag, TextDiff};

use crate::model::count_chars;

/// 旧テキストと新テキストの文字単位 diff を取り、(追加文字数, 削除文字数) を返す。
/// 共通の先頭・末尾を先に取り除き、変化した中央部分だけを diff する。
pub fn char_diff(old: &str, new: &str, ignore_whitespace: bool) -> (u64, u64) {
    if old == new {
        return (0, 0);
    }

    // 共通接頭辞（文字境界まで戻す）
    let mut prefix = old
        .as_bytes()
        .iter()
        .zip(new.as_bytes())
        .take_while(|(a, b)| a == b)
        .count();
    while !old.is_char_boundary(prefix) || !new.is_char_boundary(prefix) {
        prefix -= 1;
    }
    let (old_rest, new_rest) = (&old[prefix..], &new[prefix..]);

    // 共通接尾辞（文字境界まで戻す）
    let max_suffix = old_rest.len().min(new_rest.len());
    let mut suffix = old_rest
        .as_bytes()
        .iter()
        .rev()
        .zip(new_rest.as_bytes().iter().rev())
        .take(max_suffix)
        .take_while(|(a, b)| a == b)
        .count();
    while !old_rest.is_char_boundary(old_rest.len() - suffix)
        || !new_rest.is_char_boundary(new_rest.len() - suffix)
    {
        suffix -= 1;
    }
    let old_mid = &old_rest[..old_rest.len() - suffix];
    let new_mid = &new_rest[..new_rest.len() - suffix];

    if old_mid.is_empty() {
        return (count_chars(new_mid, ignore_whitespace), 0);
    }
    if new_mid.is_empty() {
        return (0, count_chars(old_mid, ignore_whitespace));
    }

    let diff = TextDiff::configure()
        .algorithm(Algorithm::Myers)
        .deadline(Instant::now() + Duration::from_secs(2))
        .diff_chars(old_mid, new_mid);

    let (mut added, mut removed) = (0u64, 0u64);
    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Insert => added += count_chars(change.value(), ignore_whitespace),
            ChangeTag::Delete => removed += count_chars(change.value(), ignore_whitespace),
            ChangeTag::Equal => {}
        }
    }
    (added, removed)
}

#[cfg(test)]
mod tests {
    use super::char_diff;

    #[test]
    fn basic() {
        assert_eq!(char_diff("abc", "abc", false), (0, 0));
        assert_eq!(char_diff("abc", "abXc", false), (1, 0));
        assert_eq!(char_diff("abc", "ac", false), (0, 1));
        assert_eq!(char_diff("吾輩は猫", "吾輩は犬である", false), (4, 1));
        assert_eq!(char_diff("a\nb", "a\n\nb c", false), (2, 0));
        assert_eq!(char_diff("a\nb", "a\n\nb c", true), (1, 0));
        assert_eq!(char_diff("", "あい", false), (2, 0));
    }
}
