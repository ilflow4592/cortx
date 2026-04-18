/**
 * /pipeline:dev-implement 전용 프롬프트 prefix 조립.
 * runPipeline.ts 에서 분리한 순수 함수. continuation(isFreshStart=false) 일 때만
 * 호출. Grill-me 마지막 스펙 요약 + git ls-files 소스 경로 맵을 prepend.
 */
import { invoke } from './tauri';

type Msg = { id: string; role: 'user' | 'assistant' | 'activity'; content: string };

export async function buildDevImplementPrefix(prevMsgs: Msg[], cwd: string): Promise<string> {
  let prefix = '';

  const lastSpec = [...prevMsgs]
    .filter((m) => m.role === 'assistant' && m.content.trim() && !m.content.startsWith('/pipeline:'))
    .pop();

  if (lastSpec) {
    prefix +=
      `## 📋 GRILL-ME 스펙 요약 (Cortx 자동 주입 — 이전 단계에서 확정된 개발 스펙)\n\n` +
      `아래가 완전한 개발 스펙입니다. 이 내용만으로 개발 계획서를 작성하세요.\n` +
      `추가 코드베이스 탐색(Grep/Glob/Bash find/Agent) 없이 바로 계획서 템플릿을 작성합니다.\n\n` +
      lastSpec.content +
      `\n\n`;
  }

  if (cwd) {
    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd,
        // 소스 파일만 필터 (node_modules/target/build 는 git ls-files 가 기본 제외).
        // 300라인 상한 — 800 은 컨텍스트 15k+ 토큰 추가 → API 호출당 수 분 지연.
        // test/mock/resource 경로 제외해 핵심 소스 우선 노출.
        command:
          'git ls-files 2>/dev/null | grep -E "\\.(java|kt|ts|tsx|py|rs|go|rb|scala)$" | grep -vE "(test|mock|resources|node_modules|generated)/" | head -300',
      });
      if (result.success && result.output.trim()) {
        prefix +=
          `## 📂 소스 파일 경로 맵 (Cortx pre-scan — git ls-files 상위 800)\n\n` +
          `위 스펙에서 지목된 클래스명(컨트롤러/서비스/DTO 등)을 이 목록에서 찾아 바로 Read 하세요.\n` +
          `**\`ls\` / \`find\` / \`Glob\` / 디렉토리 구조 확인 Bash 호출 금지** — 이미 전체 경로가 아래에 있습니다.\n\n` +
          '```\n' +
          result.output.trim() +
          '\n```\n\n';
      }
    } catch {
      /* git ls-files 실패 — skip, 스킬이 fallback */
    }
  }

  return prefix;
}
