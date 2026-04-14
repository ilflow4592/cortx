import { useState, useEffect } from 'react';
import { Paperclip } from 'lucide-react';
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}
import { useContextPackStore } from '../../stores/contextPackStore';
import { useTaskStore } from '../../stores/taskStore';
import { useProjectStore } from '../../stores/projectStore';
import { GitHubIcon, SlackIcon, NotionIcon, PinIcon } from '../SourceIcons';
import { McpStatusBar } from './McpStatusBar';
import { PinDialog } from './PinDialog';
import { CollectProgress } from './CollectProgress';
import { useFileDropHandler } from './useFileDropHandler';
import { useMcpFileWatcher } from './useMcpFileWatcher';
import { buildCollectSources } from './collectSourceBuilder';
import { SearchResourcesGrid } from './SearchResourcesGrid';
import { KeywordsInput } from './KeywordsInput';
import { ActionsBar, type ModelOption } from './ActionsBar';
import { SourceFilterBar } from './SourceFilterBar';
import { ItemsList } from './ItemsList';
import { LinkPreviewCard, type LinkPreview } from './LinkPreviewCard';

const MODEL_OPTIONS: ModelOption[] = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet' },
  { value: 'claude-opus-4-6', label: 'Opus' },
];

// ServiceType은 레지스트리 키 + 'other'. 새 MCP 추가는 src/config/searchResources.ts에서만.

function sourceIcon(t: string) {
  if (t === 'github') return <GitHubIcon size={14} color="var(--fg-muted)" />;
  if (t === 'slack') return <SlackIcon size={14} />;
  if (t === 'notion') return <NotionIcon size={14} color="var(--fg-muted)" />;
  return <PinIcon size={14} />;
}

export function ContextPack({ taskId, onSwitchTab, isVisible }: { taskId: string; onSwitchTab?: (tab: string) => void; isVisible?: boolean }) {
  const isCollecting = useContextPackStore((s) => s.collecting[taskId] || false);
  const collectProgress = useContextPackStore((s) => s.collectProgresses[taskId] || []);
  const sources = useContextPackStore((s) => s.sources);
  const taskItemsRaw = useContextPackStore((s) => s.items[taskId]);
  const taskDeltaRaw = useContextPackStore((s) => s.deltaItems[taskId]);
  const lastCollectedAt = useContextPackStore((s) => s.lastCollectedAt[taskId]);
  const taskItems = taskItemsRaw || [];
  const taskDelta = taskDeltaRaw || [];
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));
  const projects = useProjectStore((s) => s.projects);
  const project = task?.projectId ? projects.find((p) => p.id === task.projectId) : null;
  // Context Pack uses the actual project root, not the worktree path
  // MCP settings, .mcp.json, and ~/.claude.json projects keys are all project-root based
  const projectCwd = project?.localPath || task?.repoPath || '';
  const [showPin, setShowPin] = useState(false);
  const [showKeywords, setShowKeywords] = useState(true);
  const [keywordDraft, setKeywordDraft] = useState('');
  const storedKeywords = useContextPackStore((s) => s.keywords[taskId]) || [];
  const [collectModel, setCollectModel] = useState('claude-haiku-4-5-20251001');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const isDragging = useFileDropHandler(taskId);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const mcpServers = useContextPackStore((s) => s.mcpServers);
  const [searchResources, setSearchResources] = useState<Set<string>>(new Set(['github']));

  useMcpFileWatcher(projectCwd);

  useEffect(() => {
    // Clear this task's progress on mount
    const store = useContextPackStore.getState();
    useContextPackStore.setState({ collectProgresses: { ...store.collectProgresses, [taskId]: [] } });
    // Reload MCP servers for this project's context (project/local configs differ per project)
    if (projectCwd) {
      useContextPackStore.getState().loadMcpServers(projectCwd);
    }
  }, [taskId, projectCwd]);

  // Reload MCP servers when tab becomes visible (e.g. returning from Terminal after /mcp config)
  useEffect(() => {
    if (isVisible && projectCwd) {
      useContextPackStore.getState().loadMcpServers(projectCwd);
    }
  }, [isVisible, projectCwd]);

  // Auto-enable search resources when mcpServers change — mcpServers는 외부
  // store 변경을 통해 들어오므로 effect 내 setState가 적절한 동기화 지점
  useEffect(() => {
    const readyServices = new Set<string>(
      mcpServers.filter((s) => s.status === 'ready' && s.serviceType !== 'other').map((s) => s.serviceType),
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (readyServices.size > 0) setSearchResources(readyServices);
  }, [mcpServers]);

  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const sourceOrder: Record<string, number> = { github: 0, notion: 1, slack: 2, obsidian: 3, pin: 4 };
  const sortedItems = [...taskItems].sort(
    (a, b) => (sourceOrder[a.sourceType] ?? 9) - (sourceOrder[b.sourceType] ?? 9),
  );
  const filtered = sourceFilter ? sortedItems.filter((i) => i.sourceType === sourceFilter) : sortedItems;
  const newCount = taskItems.filter((i) => i.isNew).length;

  const handleCollect = () => {
    const store = useContextPackStore.getState();
    const currentKw = store.keywords[taskId];
    if (!currentKw || currentKw.length === 0) {
      const autoKeywords = [task?.branchName].filter(Boolean) as string[];
      store.setKeywords(taskId, autoKeywords);
    }

    const finalSources = buildCollectSources({
      searchResources,
      mcpServers,
      existingSources: store.sources,
      projectOwner: project?.githubOwner,
      projectRepo: project?.githubRepo,
    });

    store.collectAll(
      taskId,
      task?.branchName || '',
      project?.slackChannels,
      task?.title,
      finalSources,
      collectModel,
    );
  };

  const handleAddKeyword = () => {
    const kw = keywordDraft.trim();
    if (!kw) return;
    const current = useContextPackStore.getState().keywords[taskId] || [];
    if (!current.includes(kw)) {
      useContextPackStore.getState().setKeywords(taskId, [...current, kw]);
    }
    setKeywordDraft('');
  };

  const handleRemoveKeyword = (kw: string) => {
    const current = useContextPackStore.getState().keywords[taskId] || [];
    useContextPackStore.getState().setKeywords(
      taskId,
      current.filter((k) => k !== kw),
    );
  };

  const handlePreview = async (url: string) => {
    if (!url || loadingPreview) return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      const result = await tauriInvoke<{ url: string; title: string; description: string; success: boolean }>(
        'fetch_link_preview',
        { url },
      );
      if (result.success) setPreview({ url: result.url, title: result.title, description: result.description });
    } catch {
      /* ignore */
    }
    setLoadingPreview(false);
  };

  const lastCol = lastCollectedAt;
  const collectDisabled = storedKeywords.length === 0 && taskItems.length === 0;

  return (
    <div className="ctx-pack" style={{ position: 'relative' }}>
      {/* Drop overlay */}
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            background: 'var(--accent-bg)',
            border: '2px dashed var(--accent)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center', color: 'var(--accent-bright)' }}>
            <div style={{ marginBottom: 8 }}>
              <Paperclip size={32} strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Drop files or URLs here</div>
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 4 }}>They'll be pinned to this task's context</div>
          </div>
        </div>
      )}
      <div className="ctx-header">
        {/* Delta banner */}
        {taskDelta.length > 0 && (
          <div className="ctx-delta-banner">
            <span style={{ fontWeight: 600 }}>⚡ {taskDelta.length} updates</span>
            <span style={{ opacity: 0.6 }}>since you paused</span>
          </div>
        )}

        {/* Source info */}
        {project && (
          <div
            style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 3, background: project.color }} />
            {project.githubOwner && project.githubRepo ? (
              <span>
                {project.githubOwner}/{project.githubRepo}
              </span>
            ) : (
              <span>{project.name}</span>
            )}
          </div>
        )}

        <McpStatusBar sources={sources} projectCwd={projectCwd} taskId={taskId} onSwitchTab={onSwitchTab} />

        <SearchResourcesGrid
          mcpServers={mcpServers}
          searchResources={searchResources}
          setSearchResources={setSearchResources}
        />

        <KeywordsInput
          storedKeywords={storedKeywords}
          showKeywords={showKeywords}
          setShowKeywords={setShowKeywords}
          keywordDraft={keywordDraft}
          setKeywordDraft={setKeywordDraft}
          onAdd={handleAddKeyword}
          onRemove={handleRemoveKeyword}
        />

        <ActionsBar
          isCollecting={isCollecting}
          onCollect={handleCollect}
          onCancel={() => useContextPackStore.getState().cancelCollect(taskId)}
          collectDisabled={collectDisabled}
          showPin={showPin}
          togglePin={() => setShowPin(!showPin)}
          collectModel={collectModel}
          setCollectModel={setCollectModel}
          showModelMenu={showModelMenu}
          setShowModelMenu={setShowModelMenu}
          modelOptions={MODEL_OPTIONS}
        />

        <CollectProgress progress={collectProgress} isCollecting={isCollecting} />

        {showPin && <PinDialog taskId={taskId} onClose={() => setShowPin(false)} />}

        {lastCol && <div className="ctx-collected-at">Last collected: {new Date(lastCol).toLocaleTimeString()}</div>}
      </div>

      <SourceFilterBar
        taskItems={taskItems}
        newCount={newCount}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        onClear={() => useContextPackStore.getState().clearCollected(taskId)}
        sourceIcon={sourceIcon}
      />

      <LinkPreviewCard preview={preview} loading={loadingPreview} onClose={() => setPreview(null)} />

      <ItemsList taskId={taskId} filtered={filtered} isCollecting={isCollecting} onPreview={handlePreview} />
    </div>
  );
}
