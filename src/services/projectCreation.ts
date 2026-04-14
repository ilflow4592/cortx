/**
 * Project creation orchestrator.
 *
 * UI가 Tauri invoke 체인과 다중 store 업데이트 순서를 직접 알 필요가 없도록 격리.
 * NewProjectModal 등 컴포넌트는 `createProject` / `cloneAndCreateProject`만 호출한다.
 */
import { useProjectStore } from '../stores/projectStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { triggerProjectScan } from '../hooks/useProjectScan';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export interface CreateProjectResult {
  projectId: string;
  owner: string;
  repo: string;
  /** 치명적이지 않은 에러 — 호출자가 사용자에게 경고 표시 가능 */
  warnings: string[];
}

export interface CreateProjectOptions {
  /** 지정하지 않으면 `localPath`에서 파생 */
  name?: string;
  localPath: string;
  /** 이미 알고 있는 GitHub 좌표 (클론 직후 등). 없으면 remote에서 감지 시도 */
  knownOwner?: string;
  knownRepo?: string;
}

/** 로컬 경로의 마지막 세그먼트를 프로젝트명으로 파생 */
export function deriveProjectName(localPath: string): string {
  return localPath.split('/').filter(Boolean).pop() || 'project';
}

/** `git remote get-url origin` 결과에서 GitHub owner/repo 추출. 실패는 빈 문자열로 귀결 */
async function detectGitHubRemote(localPath: string): Promise<{ owner: string; repo: string }> {
  try {
    const r = await invoke<{ success: boolean; output: string; error: string }>('run_shell_command', {
      cwd: localPath,
      command: 'git remote get-url origin',
    });
    if (!r.success) return { owner: '', repo: '' };
    const match = r.output.trim().match(/github\.com[:/]([^/]+)\/([^/\s.]+)/);
    if (!match) return { owner: '', repo: '' };
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  } catch {
    return { owner: '', repo: '' };
  }
}

/** GitHub 좌표가 있으면 context pack에 source 자동 등록 (중복은 skip) */
function ensureGitHubContextSource(owner: string, repo: string): void {
  if (!owner || !repo) return;
  const store = useContextPackStore.getState();
  const exists = store.sources.some((s) => s.type === 'github' && s.owner === owner && s.repo === repo);
  if (!exists) {
    store.addSource({ type: 'github', enabled: true, token: '', owner, repo });
  }
}

/**
 * 로컬 경로에서 프로젝트 추가.
 *
 * - Git remote 감지는 best-effort: 실패해도 프로젝트는 생성됨
 * - GitHub 좌표 감지 시 context pack source 자동 등록 (중복 방지)
 * - 백그라운드 스캔은 fire-and-forget — 완료 이벤트는 `useProjectScan`이 처리
 */
export async function createProject(opts: CreateProjectOptions): Promise<CreateProjectResult> {
  const warnings: string[] = [];
  const name = opts.name || deriveProjectName(opts.localPath);

  let owner = opts.knownOwner || '';
  let repo = opts.knownRepo || '';
  if (!owner || !repo) {
    const detected = await detectGitHubRemote(opts.localPath);
    owner = detected.owner;
    repo = detected.repo;
  }

  const projectId = useProjectStore.getState().addProject(name, opts.localPath, owner, repo);
  ensureGitHubContextSource(owner, repo);

  // fire-and-forget — 성공/실패 모두 scan store가 처리하지만 트리거 자체 실패만 warning에 기록
  triggerProjectScan({ projectId, projectName: name, projectPath: opts.localPath }).catch((e) => {
    warnings.push(`Background scan trigger failed: ${String(e)}`);
  });

  return { projectId, owner, repo, warnings };
}

/** Git URL에서 owner/repo/repoName 파싱 — UI 프리뷰와 서비스 양쪽에서 사용 */
export function parseGitHubUrl(gitUrl: string): { owner: string; repo: string; repoName: string } {
  const nameMatch = gitUrl.match(/\/([^/\s.]+?)(?:\.git)?$/);
  const repoName = nameMatch ? nameMatch[1] : '';
  const ghMatch = gitUrl.match(/github\.com[:/]([^/]+)\/([^/\s.]+)/);
  if (!ghMatch) return { owner: '', repo: '', repoName };
  return { owner: ghMatch[1], repo: ghMatch[2].replace(/\.git$/, ''), repoName };
}

/**
 * Git 저장소를 클론하고 프로젝트 생성.
 *
 * "already exists" 에러는 기존 폴더 재사용으로 간주하고 계속 진행한다.
 * 다른 모든 clone 실패는 Error로 throw — 호출자가 UI에 표시한다.
 */
export async function cloneAndCreateProject(params: {
  gitUrl: string;
  cloneLocation: string;
}): Promise<CreateProjectResult> {
  const { owner, repo, repoName } = parseGitHubUrl(params.gitUrl);
  const clonePath = `${params.cloneLocation}/${repoName || 'project'}`;

  const result = await invoke<{ success: boolean; output: string; error: string }>('run_shell_command', {
    cwd: params.cloneLocation,
    command: `git clone ${params.gitUrl}`,
  });

  if (!result.success && !result.error.includes('already exists')) {
    throw new Error(`Clone failed: ${result.error}`);
  }

  return createProject({
    name: repoName || undefined,
    localPath: clonePath,
    knownOwner: owner,
    knownRepo: repo,
  });
}
