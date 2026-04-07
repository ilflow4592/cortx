import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

export function ProjectFiles({ cwd, onOpenFile }: { cwd: string; onOpenFile?: (path: string) => void }) {
  const [root, setRoot] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string>('');

  useEffect(() => { if (cwd) loadChildren(cwd).then(setRoot); }, [cwd]);

  const loadChildren = async (dir: string): Promise<TreeNode[]> => {
    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: dir,
        command: 'ls -1pa',
      });
      if (!result.success) return [];
      const items = result.output.trim().split('\n').filter(Boolean)
        .map((name) => {
          const isDir = name.endsWith('/');
          const cleanName = name.replace(/\/$/, '');
          return { name: cleanName, path: `${dir}/${cleanName}`, isDir };
        })
        .filter((e) => e.name !== '.' && e.name !== '..');
      // Sort: directories first, then files, each alphabetically (case-insensitive)
      items.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      return items;
    } catch { return []; }
  };

  const toggleDir = useCallback(async (node: TreeNode) => {
    setSelected(node.path);
    const newExpanded = new Set(expanded);
    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path);
    } else {
      newExpanded.add(node.path);
      if (!node.loaded) {
        const children = await loadChildren(node.path);
        node.children = children;
        node.loaded = true;
        setRoot([...root]); // trigger re-render
      }
    }
    setExpanded(newExpanded);
  }, [expanded, root]);

  const openFile = (path: string) => {
    setSelected(path);
    onOpenFile?.(path);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #2a3642', fontSize: 11, color: '#8b95a5', fontFamily: "'Fira Code', 'JetBrains Mono', monospace", flexShrink: 0 }}>
        {cwd.split('/').pop() || cwd}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {root.map((node) => (
          <TreeItem key={node.path} node={node} depth={0} expanded={expanded} selected={selected} onToggle={toggleDir} onOpen={openFile} />
        ))}
      </div>
    </div>
  );
}

function TreeItem({ node, depth, expanded, selected, onToggle, onOpen }: {
  node: TreeNode; depth: number; expanded: Set<string>; selected: string;
  onToggle: (node: TreeNode) => void; onOpen: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  const isSelected = selected === node.path;

  return (
    <>
      <button
        onClick={() => node.isDir ? onToggle(node) : onOpen(node.path)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: `3px 12px 3px ${12 + depth * 16}px`,
          background: isSelected ? 'rgba(90,165,165,0.08)' : 'none',
          border: 'none', color: isSelected ? '#e8eef5' : '#c0c8d4', cursor: 'pointer',
          fontFamily: "'Fira Code', 'JetBrains Mono', monospace", fontSize: 12, textAlign: 'left',
        }}
      >
        {node.isDir ? (
          <span style={{ color: '#6b7585', fontSize: 10, width: 12, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 13 }}>{node.isDir ? '📁' : '📄'}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      </button>
      {node.isDir && isOpen && node.children?.map((child) => (
        <TreeItem key={child.path} node={child} depth={depth + 1} expanded={expanded} selected={selected} onToggle={onToggle} onOpen={onOpen} />
      ))}
    </>
  );
}
