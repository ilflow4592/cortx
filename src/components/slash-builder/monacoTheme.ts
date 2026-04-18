/**
 * Monaco editor 의 cortx-dark 테마 정의 + 적용 헬퍼.
 * EditorPanel 의 onMount 로 전달해 모든 에디터 인스턴스가 동일 테마 사용.
 */
import type { OnMount } from '@monaco-editor/react';
import { resolveThemeColors } from '../../utils/monacoTheme';

export const defineCortxDarkTheme: OnMount = (_editor, monaco) => {
  monaco.editor.defineTheme('cortx-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: resolveThemeColors({
      'editor.background': 'var(--bg-surface)',
      'editor.foreground': 'var(--fg-secondary)',
      'editorLineNumber.foreground': 'var(--fg-dim)',
      'editorCursor.foreground': 'var(--accent-bright)',
      'editor.selectionBackground': 'var(--border-strong)',
      'editor.lineHighlightBackground': 'var(--bg-surface-hover)',
    }),
  });
  monaco.editor.setTheme('cortx-dark');
};
