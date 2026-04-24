import { useEffect, useRef, useState } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';

interface ChatSearchBoxProps {
  onClose: () => void;
}

/**
 * Claude 탭 in-page 텍스트 검색. Chromium `window.find()` 를 사용해 채팅 스크롤러
 * 내부 텍스트를 하이라이트 + 스크롤. Enter 다음, Shift+Enter 이전, ESC 닫기.
 *
 * Tauri 웹뷰가 Chromium 기반이라 `window.find` 가 실제로 동작한다. 비표준 API 지만
 * 간단한 in-app 검색 UX 에 충분 — Ranges 기반 커스텀 하이라이터는 Markdown HTML
 * 구조를 모두 순회해야 해서 복잡도가 훨씬 높다.
 */
export function ChatSearchBox({ onClose }: ChatSearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const runFind = (backwards: boolean) => {
    if (!query) return;
    const w = window as Window & {
      find?: (text: string, caseSensitive?: boolean, backwards?: boolean, wrap?: boolean) => boolean;
    };
    const found = w.find?.(query, false, backwards, true) ?? false;
    setNotFound(!found);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      runFind(e.shiftKey);
    }
  };

  return (
    <div
      role="search"
      style={{
        position: 'absolute',
        top: 8,
        right: 12,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        background: 'var(--bg-surface-elevated, #1f1f1f)',
        border: '1px solid var(--border, #333)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setNotFound(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder="채팅 내 검색"
        style={{
          width: 220,
          fontSize: 12,
          padding: '3px 8px',
          background: 'var(--bg, #111)',
          color: 'var(--fg, #e5e5e5)',
          border: `1px solid ${notFound ? '#ef4444' : 'var(--border-subtle, #2a2a2a)'}`,
          borderRadius: 4,
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      <IconButton title="이전 (Shift+Enter)" onClick={() => runFind(true)}>
        <ChevronUp size={14} />
      </IconButton>
      <IconButton title="다음 (Enter)" onClick={() => runFind(false)}>
        <ChevronDown size={14} />
      </IconButton>
      <IconButton title="닫기 (Esc)" onClick={onClose}>
        <X size={14} />
      </IconButton>
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        padding: 0,
        background: 'transparent',
        border: 'none',
        color: 'var(--fg-dim, #9ca3af)',
        cursor: 'pointer',
        borderRadius: 3,
      }}
    >
      {children}
    </button>
  );
}
