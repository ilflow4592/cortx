/**
 * Pipeline 슬래시 커맨드 → 실행 프롬프트 해석.
 *
 * 우선순위:
 *  1. `/pipeline:_approve-plan` — 합성 명령. 스킬 파일 없음. Plan mode 승인
 *     후 구현 진입 지시 인라인 텍스트 반환.
 *  2. 그 외 `/pipeline:*` — 내장 바이너리 스킬 (`get_builtin_pipeline_skill`)
 *     우선 사용. 프로젝트/글로벌 스킬 파일은 무시 (Cortx 소유 워크플로우).
 *  3. 기타 (`/git:*`, `/sc:*` 등) — project-local → `$HOME` 순 파일 조회.
 */
import { invoke } from './tauri';

export interface SkillResolveArgs {
  command: string;
  args: string;
  branch: string;
  title: string;
  cwd: string;
}

const APPROVE_PLAN_PROMPT = [
  '✅ 사용자가 이전에 제출한 계획을 승인했습니다.',
  '이제 Plan mode 가 해제되어 Write/Edit 이 가능합니다.',
  '',
  '다음 순서로 진행:',
  '1. 먼저 [PIPELINE:dev_plan:done] 마커 출력',
  '2. 이어서 [PIPELINE:implement:in_progress] 마커 출력',
  '3. 승인된 계획대로 **바로 구현 시작**. 계획 재출력·재확인 금지.',
  '4. 각 단계별 파일 수정은 Edit/Write 로 직접 수행.',
  '5. 테스트 작성 + 실행까지 완료.',
  '6. 구현 완료 후 사용자에게 "커밋하시겠습니까?" 라고 물어보고 중단.',
  '',
  '⛔ prod 브랜치 관련 명령 일체 금지.',
  '⛔ 한국어로만 대화.',
].join('\n');

export async function resolveSkillPrompt({ command, args, branch, title, cwd }: SkillResolveArgs): Promise<string> {
  const cmdName = command.slice(1);
  const skillFileKey = cmdName.replace(/:/g, '/') + '.md';
  const skillLookupKey = cmdName.replace(/:/g, '/');
  const substitute = (prompt: string): string =>
    prompt
      .replace(/\$ARGUMENTS/g, args)
      .replace(/\{TASK_ID\}/g, branch)
      .replace(/\{TASK_NAME\}/g, title);

  if (command.startsWith('/pipeline:_approve-plan')) {
    return APPROVE_PLAN_PROMPT;
  }

  if (command.startsWith('/pipeline:')) {
    try {
      const builtin = await invoke<string | null>('get_builtin_pipeline_skill', { name: skillLookupKey });
      if (builtin && builtin.trim()) {
        return substitute(builtin);
      }
    } catch {
      /* builtin 조회 실패 시 파일 fallback */
    }
  }

  for (const base of [`${cwd}/.claude/commands`, '$HOME/.claude/commands']) {
    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: '/',
        command: `cat "${base}/${skillFileKey}" 2>/dev/null`,
      });
      if (result.success && result.output.trim()) {
        return substitute(result.output);
      }
    } catch {
      /* continue */
    }
  }

  return `${command} ${args}`;
}
