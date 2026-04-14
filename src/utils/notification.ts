/** 데스크톱 알림 — 권한이 허용된 경우에만 방출. 예외는 조용히 무시한다. */
export function sendNotification(title: string, body: string): void {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}
