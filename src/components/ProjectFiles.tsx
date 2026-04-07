import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FileEntry {
  name: string;
  isDir: boolean;
}

export function ProjectFiles({ cwd }: { cwd: string }) {
  const [path, setPath] = useState(cwd);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPath(cwd); }, [cwd]);
  useEffect(() => { if (path) loadDir(path); }, [path]);

  const loadDir = async (dir: string) => {
    setLoading(true);
    setFileContent(null);
    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: dir,
        command: 'ls -1pa',
      });
      if (result.success) {
        const items = result.output.trim().split('\n').filter(Boolean).map((name) => ({
          name: name.replace(/\/$/, ''),
          isDir: name.endsWith('/'),
        })).filter((e) => e.name !== '.');
        setEntries(items);
      }
    } catch { /* skip */ }
    setLoading(false);
  };

  const openFile = async (name: string) => {
    const fullPath = `${path}/${name}`;
    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: path,
        command: `head -500 '${name.replace(/'/g, "'\\''")}'`,
      });
      if (result.success) {
        setFileContent({ path: fullPath, content: result.output });
      }
    } catch { /* skip */ }
  };

  const navigate = (name: string) => {
    if (name === '..') {
      const parent = path.split('/').slice(0, -1).join('/') || '/';
      setPath(parent);
    } else {
      setPath(`${path}/${name}`);
    }
  };

  const relativePath = path.startsWith(cwd) ? path.slice(cwd.length) || '/' : path;

  if (fileContent) {
    const fileName = fileContent.path.split('/').pop() || '';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #27272f', flexShrink: 0 }}>
          <button
            onClick={() => setFileContent(null)}
            style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: 14 }}
          >←</button>
          <span style={{ fontSize: 11, color: '#8b8b95', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileContent.path.replace(cwd + '/', '')}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7 }}>
          {fileContent.content.split('\n').map((line, i) => (
            <div key={i} style={{ display: 'flex', minHeight: 20 }}>
              <span style={{ width: 48, textAlign: 'right', paddingRight: 12, color: '#3f3f46', flexShrink: 0, userSelect: 'none' }}>{i + 1}</span>
              <span style={{ color: '#b4b4bc', whiteSpace: 'pre', overflow: 'hidden' }}>{line}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #27272f', fontSize: 11, color: '#8b8b95', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
        {relativePath}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && <div style={{ padding: 16, fontSize: 11, color: '#71717a' }}>Loading...</div>}
        {entries.map((entry) => (
          <button
            key={entry.name}
            onClick={() => entry.isDir ? navigate(entry.name) : openFile(entry.name)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '5px 16px', background: 'none', border: 'none', borderBottom: '1px solid #ffffff06',
              color: '#b4b4bc', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, textAlign: 'left',
            }}
          >
            <span style={{ color: entry.isDir ? '#818cf8' : '#71717a', fontSize: 13, width: 18 }}>
              {entry.isDir ? '📁' : '📄'}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
