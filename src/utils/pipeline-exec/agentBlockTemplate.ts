/**
 * Agent 블록 → Claude 프롬프트 변환기.
 * CustomSkillRef (kind='agent') 를 받아 "Claude 가 Task tool 을 호출하도록 지시하는"
 * 일반 텍스트 프롬프트로 변환.
 *
 * v1 범위: 단일 agent 순차 실행. 병렬 그룹은 v2+.
 * 결과 수집: agent 응답을 `[OUTPUT:{outputKey}]...[/OUTPUT:{outputKey}]` 로 감싸도록
 * 강제. 마커 누락 시 outputMarker.ts 의 extractOutputMarkers 가 silent fallback 으로
 * 전체 응답을 {outputKey} 로 취급 (runCustomPipeline 내 보정).
 */
import type { CustomSkillRef } from '../../types/customPipeline';

/**
 * agent 블록을 실행하라는 Claude Code 지시문 생성.
 * body 는 사용자 커스텀 프롬프트 (있으면 우선 사용, 없으면 빈 지시).
 */
export function buildAgentBlockPrompt(
  skillRef: Extract<CustomSkillRef, { kind: 'agent' }>,
  taskContext: {
    phaseLabel: string;
    artifacts: Record<string, string>;
  },
): string {
  const outputKey = skillRef.outputKey || 'agent_result';
  const agentPrompt = skillRef.prompt?.trim() || `Execute the ${skillRef.subagentType} agent's default task.`;

  const artifactsBlock =
    Object.keys(taskContext.artifacts).length > 0
      ? `\n\n## 이전 스킬 산출물 (참조용)\n\n${Object.entries(taskContext.artifacts)
          .map(([k, v]) => `### ${k}\n\n${v}`)
          .join('\n\n')}\n`
      : '';

  return `# Agent Block — ${taskContext.phaseLabel}

Cortx 커스텀 파이프라인이 이 스킬을 Agent 블록으로 지정했습니다.
**Task tool 을 정확히 한 번** 호출해 아래 작업을 수행하세요:

\`\`\`
Task(
  subagent_type="${skillRef.subagentType}",
  description="${taskContext.phaseLabel} — agent block",
  prompt=<<<
${agentPrompt}
>>>
)
\`\`\`

Agent 가 결과를 반환하면 해당 응답 전체를 아래 마커로 감싸서 출력하세요.
마커가 누락되면 다음 스킬이 산출물에 접근할 수 없습니다.

\`\`\`
[OUTPUT:${outputKey}]
{agent 응답 본문}
[/OUTPUT:${outputKey}]
\`\`\`

- 마커 바깥에는 간단한 진행 설명 외 불필요한 출력 금지
- Task 호출은 정확히 1회. 재호출/반복 금지
- Agent 내부 사고/작업 로그는 마커 안에 포함하지 말고 최종 결과만 포함
${artifactsBlock}`;
}
