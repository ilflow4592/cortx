//! 규칙 문서가 sparse/partial일 때의 폴백 — 파일 트리와 언어 히스토그램을
//! 제한된 깊이로 수집해 Claude에게 최소한의 프로젝트 윤곽을 제공한다.

use std::fs;
use std::path::Path;

use super::{MAX_TREE_FILES, SCAN_IGNORE_DIRS};

/// depth 제한 하에 상위 디렉토리/파일 목록을 수집. 반환: (경로 목록, 전체 파일 수).
pub fn collect_file_tree(root: &Path, max_depth: usize) -> (Vec<String>, u64) {
    let mut entries: Vec<String> = Vec::new();
    let mut total_count: u64 = 0;
    walk_tree(root, root, 0, max_depth, &mut entries, &mut total_count);
    entries.sort();
    (entries, total_count)
}

fn walk_tree(
    root: &Path,
    dir: &Path,
    depth: usize,
    max_depth: usize,
    entries: &mut Vec<String>,
    count: &mut u64,
) {
    if depth > max_depth || entries.len() >= MAX_TREE_FILES {
        return;
    }
    let Ok(reader) = fs::read_dir(dir) else {
        return;
    };
    for entry in reader.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".ai" {
            continue;
        }
        if SCAN_IGNORE_DIRS.contains(&name.as_str()) {
            continue;
        }
        let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
        if path.is_dir() {
            entries.push(format!("{}/", rel));
            walk_tree(root, &path, depth + 1, max_depth, entries, count);
        } else {
            *count += 1;
            if depth <= max_depth && entries.len() < MAX_TREE_FILES {
                entries.push(rel);
            }
        }
    }
}

/// 확장자별 파일 수를 계산해 상위 5개를 반환 (빈도 내림차순).
pub fn collect_language_histogram(root: &Path) -> Vec<(String, u64)> {
    use std::collections::HashMap;
    let mut counts: HashMap<String, u64> = HashMap::new();
    count_exts(root, root, 0, 4, &mut counts);
    let mut vec: Vec<(String, u64)> = counts.into_iter().collect();
    vec.sort_by(|a, b| b.1.cmp(&a.1));
    vec.into_iter().take(5).collect()
}

fn count_exts(
    root: &Path,
    dir: &Path,
    depth: usize,
    max_depth: usize,
    counts: &mut std::collections::HashMap<String, u64>,
) {
    if depth > max_depth {
        return;
    }
    let Ok(reader) = fs::read_dir(dir) else { return };
    for entry in reader.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".ai" {
            continue;
        }
        if SCAN_IGNORE_DIRS.contains(&name.as_str()) {
            continue;
        }
        if path.is_dir() {
            count_exts(root, &path, depth + 1, max_depth, counts);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            *counts.entry(ext.to_lowercase()).or_insert(0) += 1;
        }
    }
}
