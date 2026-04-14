/** 업데이트 릴리즈 노트 뷰어 (markdown). */
import Markdown from 'react-markdown';

export function ReleaseNotes({ notes }: { notes: string }) {
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-surface-hover)',
        borderRadius: 6,
        marginBottom: 14,
        fontSize: 11,
        color: 'var(--fg-secondary)',
        maxHeight: 240,
        overflowY: 'auto',
      }}
    >
      <Markdown>{notes}</Markdown>
    </div>
  );
}
