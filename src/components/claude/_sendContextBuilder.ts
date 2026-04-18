/**
 * handleSend 용 context 조립 — useClaudeSession.ts 에서 분리.
 *
 * Pipeline tracking directive + Context Pack summary + 추가 파일 경로(.cortx/
 * project-context.md) 를 묶어서 `claude_spawn` 에 그대로 넘길 수 있는 형태로
 * 반환한다. pin URL 에 fullText 없으면 fetch 하는 부수효과 포함.
 */
import type { ContextItem } from '../../types/contextPack';
import { fetchPinUrl } from '../../utils/pipelineExec';
import { serializeContextItems } from './_contextSerialize';
import { getOrCreateCanary, buildCanaryDirective } from './canaryGuard';
import { PIPELINE_TRACKING_DIRECTIVE, CORTX_CONTEXT_PACK_MODE_DIRECTIVE } from './_pipelineDirective';

const SOURCE_ICONS: Record<string, string> = {
  github: 'GitHub',
  slack: 'Slack',
  notion: 'Notion',
  pin: 'Pin',
};

export interface SendContextResult {
  contextSummary: string;
  contextFiles: string[];
  contextLoadMessage: string | null;
}

export interface BuildSendContextArgs {
  taskId: string;
  cwd: string;
  isPipeline: boolean;
  hasExistingSession: boolean;
  contextItems: ContextItem[];
}

export async function buildSendContext({
  taskId,
  cwd,
  isPipeline,
  hasExistingSession,
  contextItems,
}: BuildSendContextArgs): Promise<SendContextResult> {
  let contextSummary = '';
  let contextFiles: string[] = [];
  let contextLoadMessage: string | null = null;

  if (isPipeline) {
    contextSummary = PIPELINE_TRACKING_DIRECTIVE + '\n' + buildCanaryDirective(getOrCreateCanary(taskId));
  }

  if (hasExistingSession) {
    return { contextSummary, contextFiles, contextLoadMessage };
  }

  // Fetch content for pinned HTTP URLs missing fullText
  const pinFetches = contextItems
    .filter((item) => item.sourceType === 'pin' && item.url && item.url.startsWith('http') && !item.metadata?.fullText)
    .map(async (item) => {
      const content = await fetchPinUrl(item.url);
      if (content) {
        item.metadata = { ...item.metadata, fullText: content };
      }
    });
  if (pinFetches.length > 0) await Promise.all(pinFetches);

  const nonFileItems = contextItems.filter(
    (item) => !item.url || item.url.startsWith('http') || item.sourceType !== 'pin',
  );
  const itemsSummary = serializeContextItems(nonFileItems, taskId);

  if (isPipeline && contextItems.length > 0) {
    contextSummary += CORTX_CONTEXT_PACK_MODE_DIRECTIVE;
  }
  if (itemsSummary) {
    contextSummary = contextSummary ? `${contextSummary}\n\n---\n\n${itemsSummary}` : itemsSummary;
  }

  contextFiles = contextItems.filter((item) => item.url && !item.url.startsWith('http')).map((item) => item.url);

  // Pre-inject project-context.md so Claude skips rediscovery
  if (isPipeline && cwd) {
    const ctxFile = `${cwd}/.cortx/project-context.md`;
    try {
      const { exists } = await import('@tauri-apps/plugin-fs');
      if (await exists(ctxFile)) {
        contextFiles.push(ctxFile);
      }
    } catch {
      /* skip — fs 플러그인 로드 실패 or 파일 미존재 */
    }
  }

  if (isPipeline && contextItems.length > 0) {
    const lines = contextItems.map((item) => {
      const src = SOURCE_ICONS[item.sourceType] || item.sourceType;
      return `  [${src}] ${item.title}`;
    });
    contextLoadMessage = `Loading Context Pack (${contextItems.length} items)\n${lines.join('\n')}`;
  }

  return { contextSummary, contextFiles, contextLoadMessage };
}
