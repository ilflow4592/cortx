import { useState, useEffect } from 'react';
import { useContextPackStore } from '../../stores/contextPackStore';
import { useMcpStore } from '../../stores/mcpStore';
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
import { DropOverlay } from './DropOverlay';
import { ProjectSourceBadge } from './ProjectSourceBadge';
import { useContextPackData } from './useContextPackData';

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

const MODEL_OPTIONS: ModelOption[] = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet' },
  { value: 'claude-opus-4-7', label: 'Opus' },
];

function sourceIcon(t: string) {
  if (t === 'github') return <GitHubIcon size={14} color="var(--fg-muted)" />;
  if (t === 'slack') return <SlackIcon size={14} />;
  if (t === 'notion') return <NotionIcon size={14} color="var(--fg-muted)" />;
  return <PinIcon size={14} />;
}

export function ContextPack({
  taskId,
  onSwitchTab,
  isVisible,
}: {
  taskId: string;
  onSwitchTab?: (tab: string) => void;
  isVisible?: boolean;
}) {
  const {
    isCollecting,
    collectProgress,
    sources,
    taskItems,
    taskDelta,
    lastCollectedAt,
    storedKeywords,
    mcpServers,
    task,
    project,
    projectCwd,
    sortedItems,
    newCount,
  } = useContextPackData(taskId);

  const [showPin, setShowPin] = useState(false);
  const [showKeywords, setShowKeywords] = useState(true);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [collectModel, setCollectModel] = useState('claude-haiku-4-5-20251001');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [searchResources, setSearchResources] = useState<Set<string>>(new Set(['github']));

  const isDragging = useFileDropHandler(taskId);
  useMcpFileWatcher(projectCwd);

  // 탭 진입·프로젝트 변경 시 MCP 새로 로드 + 기존 진행률 초기화
  useEffect(() => {
    const store = useContextPackStore.getState();
    useContextPackStore.setState({ collectProgresses: { ...store.collectProgresses, [taskId]: [] } });
    if (projectCwd) useMcpStore.getState().load(projectCwd);
  }, [taskId, projectCwd]);

  // 터미널에서 /mcp 실행 후 돌아왔을 때 갱신
  useEffect(() => {
    if (isVisible && projectCwd) useMcpStore.getState().load(projectCwd);
  }, [isVisible, projectCwd]);

  // MCP 서버 상태가 바뀌면 ready 상태인 리소스를 자동 선택
  useEffect(() => {
    const readyServices = new Set<string>(
      mcpServers.filter((s) => s.status === 'ready' && s.serviceType !== 'other').map((s) => s.serviceType),
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (readyServices.size > 0) setSearchResources(readyServices);
  }, [mcpServers]);

  const filtered = sourceFilter ? sortedItems.filter((i) => i.sourceType === sourceFilter) : sortedItems;

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
    store.collectAll(taskId, task?.branchName || '', project?.slackChannels, task?.title, finalSources, collectModel);
  };

  const handleAddKeyword = () => {
    const kw = keywordDraft.trim();
    if (!kw) return;
    const current = useContextPackStore.getState().keywords[taskId] || [];
    if (!current.includes(kw)) useContextPackStore.getState().setKeywords(taskId, [...current, kw]);
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

  const collectDisabled = storedKeywords.length === 0 && taskItems.length === 0;

  return (
    <div className="ctx-pack" style={{ position: 'relative' }}>
      <DropOverlay visible={isDragging} />
      <div className="ctx-header">
        {taskDelta.length > 0 && (
          <div className="ctx-delta-banner">
            <span style={{ fontWeight: 600 }}>⚡ {taskDelta.length} updates</span>
            <span style={{ opacity: 0.6 }}>since you paused</span>
          </div>
        )}

        <ProjectSourceBadge project={project} />

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

        {lastCollectedAt && (
          <div className="ctx-collected-at">Last collected: {new Date(lastCollectedAt).toLocaleTimeString()}</div>
        )}
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
