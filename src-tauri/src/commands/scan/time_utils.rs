//! chrono 크레이트 없이 동작하는 간이 시간 유틸.
//!
//! `iso_now()`는 초 단위 ISO 8601 UTC 문자열을 반환하며, 스캔 메타데이터·
//! 자동 생성 마커에 모두 사용된다.

/// 초 단위 ISO 8601 UTC 타임스탬프 (`YYYY-MM-DDTHH:MM:SSZ`).
pub fn iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (y, mo, d, h, mi, s) = unix_to_ymdhms(secs as i64);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, mi, s)
}

/// Unix 타임스탬프(초) → (year, month, day, hour, min, sec) — UTC.
fn unix_to_ymdhms(ts: i64) -> (i32, u32, u32, u32, u32, u32) {
    let secs_per_day = 86400i64;
    let mut days = ts / secs_per_day;
    let mut rem = ts % secs_per_day;
    if rem < 0 {
        rem += secs_per_day;
        days -= 1;
    }
    let h = (rem / 3600) as u32;
    let mi = ((rem % 3600) / 60) as u32;
    let s = (rem % 60) as u32;

    // 1970-01-01 기준 연 누적
    let mut year: i32 = 1970;
    loop {
        let leap = is_leap(year);
        let ydays = if leap { 366 } else { 365 };
        if days >= ydays {
            days -= ydays;
            year += 1;
        } else {
            break;
        }
    }
    let months = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut mo: u32 = 1;
    for m in months.iter() {
        if days >= *m {
            days -= *m;
            mo += 1;
        } else {
            break;
        }
    }
    let d = days as u32 + 1;
    (year, mo, d, h, mi, s)
}

fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
