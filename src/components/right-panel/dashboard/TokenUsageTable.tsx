/** 전체 phase 합산 토큰/비용 요약 + 메타데이터(complexity/PR/리뷰 라운드). */
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { PipelineState } from '../../../types/task';
import { PHASE_ORDER } from '../../../constants/pipeline';
import { formatTokens } from './types';

interface Props {
  pipeline: PipelineState;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

function parsePrRepo(url: string | undefined): { owner: string; repo: string; number: string } | null {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return m ? { owner: m[1], repo: m[2], number: m[3] } : null;
}

async function openExternal(url: string): Promise<void> {
  try {
    const shell = await import('@tauri-apps/plugin-shell');
    await shell.open(url);
  } catch {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* give up */
    }
  }
}

export function TokenUsageTable({ pipeline }: Props) {
  const totalIn = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.inputTokens || 0), 0);
  const totalOut = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.outputTokens || 0), 0);
  const totalCost = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.costUsd || 0), 0);

  // PR 제목 lazy fetch — `gh pr view` 로 한 번만 조회, prUrl 이 바뀔 때 재조회.
  const prUrl = pipeline.prUrl;
  const [prTitle, setPrTitle] = useState<string | null>(null);

  useEffect(() => {
    const repo = parsePrRepo(prUrl);
    if (!repo) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd: '/',
          command: `gh pr view ${repo.number} --repo ${repo.owner}/${repo.repo} --json title -q .title 2>/dev/null`,
        });
        if (cancelled) return;
        const title = res.success ? res.output.trim() : '';
        setPrTitle(title || null);
      } catch {
        if (!cancelled) setPrTitle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prUrl]);

  return (
    <>
      {totalIn + totalOut > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 10px',
            marginTop: 8,
            borderTop: '1px solid var(--border-strong)',
            fontSize: 10,
            color: 'var(--fg-subtle)',
            fontFamily: "'Fira Code', monospace",
          }}
        >
          <span>
            Total: {formatTokens(totalIn)} in / {formatTokens(totalOut)} out
          </span>
          {totalCost > 0 && <span>${totalCost.toFixed(4)}</span>}
        </div>
      )}

      {(pipeline.complexity || pipeline.prUrl || pipeline.reviewRounds !== undefined) && (
        <>
          <div className="rp-section" style={{ marginTop: 14 }}>
            Info
          </div>
          <div className="wt-info">
            {pipeline.complexity && (
              <div className="wt-row">
                <span>Complexity</span>
                <span className="val">{pipeline.complexity}</span>
              </div>
            )}
            {pipeline.prNumber && (
              <div className="wt-row" style={{ gap: 12, alignItems: 'center' }}>
                <span style={{ flexShrink: 0 }}>PR</span>
                {pipeline.prUrl ? (
                  <button
                    type="button"
                    onClick={() => openExternal(pipeline.prUrl!)}
                    title={`${prTitle ? prTitle + ' · ' : ''}${pipeline.prUrl}`}
                    className="val"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--accent-bright)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'right',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      flex: 1,
                      minWidth: 0,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}
                    >
                      #{pipeline.prNumber}
                      {prTitle ? ` — ${prTitle}` : ''}
                    </span>
                    <ExternalLink size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                  </button>
                ) : (
                  <span className="val">#{pipeline.prNumber}</span>
                )}
              </div>
            )}
            {pipeline.reviewRounds !== undefined && (
              <div className="wt-row">
                <span>Review rounds</span>
                <span className="val">{pipeline.reviewRounds}</span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
