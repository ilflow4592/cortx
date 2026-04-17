/**
 * Skill library — 파이프라인 빌더가 드래그 소스로 표시할 스킬 목록 집계.
 * 소스 우선순위: builtin → project → user (중복 방지 위해 이 순서로 누적).
 *
 * builtin: src-tauri 의 include_str! 로 embed 된 파이프라인 스킬 (변경 불가, Fork 필요)
 * project: <cwd>/.claude/commands/*.md
 * user:    ~/.claude/commands/*.md
 *
 * Frontmatter 가 있으면 SkillContract 를 같이 노출 — UI 에서 requires/produces 표시.
 */
import type { SkillKind, SkillContract } from '../types/customPipeline';
import type { SlashCommand } from '../types/generated/SlashCommand';
import { parseSkillFrontmatter } from '../utils/pipeline-exec/frontmatterParser';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export interface SkillEntry {
  kind: SkillKind;
  /** 드래그/참조 시 사용하는 식별자. slash 명령 이름과 동일 형식 (예: "pipeline:dev-task") */
  id: string;
  /** UI 표시용 — 기본은 id, 파일에 # 헤더 있으면 그걸 사용 */
  displayName: string;
  /** 파일 첫 라인 또는 frontmatter description */
  description: string;
  /** frontmatter 파싱된 contract (optional) */
  contract?: SkillContract;
  /** builtin 은 fork 필요 → true 면 편집 불가 */
  forkable: boolean;
}

/**
 * Cortx 바이너리에 embed 된 pipeline builtin 스킬 카탈로그.
 * src-tauri/src/commands/claude/builtin_skills.rs 의 include_str! 과 일치해야 함.
 * list_slash_commands 에는 포함되지 않으므로 여기서 직접 주입.
 */
const BUILTIN_PIPELINE_SKILLS: Array<{ id: string; description: string }> = [
  { id: 'pipeline:dev-task', description: 'Grill-me Q&A + 스펙 정리' },
  { id: 'pipeline:dev-implement', description: '개발 계획 + 구현 (plan mode)' },
  { id: 'pipeline:dev-review-loop', description: 'PR 리뷰 대응 + 재커밋 반복' },
  { id: 'pipeline:dev-resume', description: '중단된 파이프라인 재개' },
  { id: 'pipeline:pr-review-fu', description: 'PR 리뷰 follow-up' },
];

/**
 * 전체 라이브러리 조회. cwd 가 있으면 project 스킬 포함.
 * Cortx 내장 파이프라인 스킬(BUILTIN_PIPELINE_SKILLS) 먼저, 그 다음 project/user.
 * 동일 id 가 project/user 에 있어도 builtin 은 별도 항목으로 유지 (사용자가 fork 대상 구분 가능).
 */
export async function listSkillLibrary(cwd: string | undefined): Promise<SkillEntry[]> {
  const entries: SkillEntry[] = [];

  // 1) 내장 파이프라인 스킬 (include_str! embed) — list_slash_commands 밖에서 주입
  for (const b of BUILTIN_PIPELINE_SKILLS) {
    entries.push({
      kind: 'builtin',
      id: b.id,
      displayName: b.id,
      description: b.description,
      forkable: true,
    });
  }

  // 2) project/user .md 스킬 (list_slash_commands 에서 조회)
  const commands = await invoke<SlashCommand[]>('list_slash_commands', { projectCwd: cwd });
  for (const cmd of commands) {
    if (cmd.source === 'builtin') continue; // Claude CLI 내장 slash (/help, /clear) 는 라이브러리에서 제외

    const kind = normalizeKind(cmd.source);
    const entry: SkillEntry = {
      kind,
      id: cmd.name,
      displayName: cmd.name,
      description: cmd.description,
      forkable: false,
    };

    try {
      const body = await invoke<string>('read_slash_command', {
        name: cmd.name,
        source: cmd.source,
        projectCwd: cwd,
      });
      const parsed = parseSkillFrontmatter(body);
      if (parsed.frontmatter) entry.contract = parsed.frontmatter;
    } catch {
      // 읽기 실패 — contract 없이 목록에 포함 (탐색에만 사용)
    }
    entries.push(entry);
  }

  return entries;
}

function normalizeKind(source: string): SkillKind {
  switch (source) {
    case 'builtin':
      return 'builtin';
    case 'project':
      return 'project';
    case 'user':
      return 'user';
    default:
      return 'user'; // 알 수 없는 값은 편집 가능한 쪽으로 보수적 분류
  }
}

/**
 * Builtin 스킬을 project 복사본으로 fork.
 * - 기존 파일 존재 여부는 writeSlashCommand 가 덮어씀 (Rust 에서 create_dir_all + write).
 * - 반환된 새 id 는 "pipeline:<stem>-fork" 형식 기본 (사용자가 변경 가능).
 */
export async function forkSkillToProject(srcId: string, cwd: string, targetId?: string): Promise<string> {
  if (!srcId.startsWith('pipeline:')) {
    throw new Error('Fork currently supports only pipeline:* builtin skills');
  }
  // builtin 본문은 get_builtin_pipeline_skill 로 로드 (lookup key = "pipeline/dev-task")
  const lookup = srcId.replace(/:/g, '/');
  const body = await invoke<string | null>('get_builtin_pipeline_skill', { name: lookup });
  if (!body) {
    throw new Error(`Builtin skill not found: ${srcId}`);
  }
  const newId = targetId || `${srcId}-fork`;
  await invoke<void>('write_slash_command', {
    name: newId,
    source: 'project',
    content: body,
    projectCwd: cwd,
  });
  return newId;
}

/**
 * 스킬 본문 로드 (모달 에디터용).
 * builtin 은 get_builtin_pipeline_skill, 그 외는 read_slash_command.
 */
export async function readSkillBody(id: string, kind: SkillKind, cwd: string | undefined): Promise<string> {
  if (kind === 'builtin') {
    const lookup = id.replace(/:/g, '/');
    const body = await invoke<string | null>('get_builtin_pipeline_skill', { name: lookup });
    if (!body) throw new Error(`Builtin skill not found: ${id}`);
    return body;
  }
  const source = kind === 'project' ? 'project' : 'user';
  return invoke<string>('read_slash_command', {
    name: id,
    source,
    projectCwd: cwd,
  });
}

/**
 * 사용자 편집 가능 스킬의 본문 저장.
 * builtin 은 fork 필요 (forkSkillToProject 로 선행 처리).
 */
export async function writeSkillBody(
  id: string,
  kind: 'project' | 'user',
  content: string,
  cwd: string | undefined,
): Promise<void> {
  await invoke<void>('write_slash_command', {
    name: id,
    source: kind,
    content,
    projectCwd: cwd,
  });
}
