import type { ClaudeAgentEntry } from '../types/customPipeline';

/**
 * Claude Code 내장 subagent 23종 카탈로그.
 * 출처: Claude Code CLI Agent tool 의 subagent_type 파라미터 허용 값.
 * ~/.claude/agents/*.md 에 사용자가 커스텀 agent 를 추가하면 runtime 에서 이 목록과 머지됨
 * (services/agentRegistry.ts 참조).
 *
 * 변경 시 주의: subagentType 은 CLI 가 인식하는 정확한 문자열이어야 함.
 */
export const BUILTIN_AGENTS: ClaudeAgentEntry[] = [
  {
    subagentType: 'backend-architect',
    displayName: 'Backend Architect',
    description: '데이터 무결성/보안/장애 허용성 중심 백엔드 시스템 설계',
    icon: '🏛️',
    isCustom: false,
  },
  {
    subagentType: 'business-panel-experts',
    displayName: 'Business Panel',
    description: 'Christensen/Porter/Drucker 등 전략가 패널',
    icon: '💼',
    isCustom: false,
  },
  {
    subagentType: 'claude-code-guide',
    displayName: 'Claude Code Guide',
    description: 'Claude Code/Agent SDK/API 관련 질문 응답',
    icon: '📘',
    isCustom: false,
  },
  {
    subagentType: 'code-refactorer',
    displayName: 'Code Refactorer',
    description: '코드 정리·최적화·클린 아키텍처',
    icon: '♻️',
    isCustom: false,
  },
  {
    subagentType: 'codex:codex-rescue',
    displayName: 'Codex Rescue',
    description: 'Codex 런타임으로 복잡 코딩 태스크 핸드오프',
    icon: '🆘',
    isCustom: false,
  },
  {
    subagentType: 'deep-research-agent',
    displayName: 'Deep Research',
    description: '웹·문서 종합 심층 리서치',
    icon: '🔎',
    isCustom: false,
  },
  {
    subagentType: 'devops-architect',
    displayName: 'DevOps Architect',
    description: '인프라·배포 자동화, 관측성 중심',
    icon: '⚙️',
    isCustom: false,
  },
  {
    subagentType: 'Explore',
    displayName: 'Explore',
    description: '코드베이스 빠른 탐색 (파일/심볼/질문 기반)',
    icon: '🔍',
    isCustom: false,
  },
  {
    subagentType: 'frontend-architect',
    displayName: 'Frontend Architect',
    description: '접근성·성능·UX 중심 프론트엔드 설계',
    icon: '🎨',
    isCustom: false,
  },
  {
    subagentType: 'general-purpose',
    displayName: 'General Purpose',
    description: '다목적 리서치·검색·다단계 태스크',
    icon: '🧰',
    isCustom: false,
  },
  {
    subagentType: 'learning-guide',
    displayName: 'Learning Guide',
    description: '점진적 학습·실용 예제 중심 코드 설명',
    icon: '🎓',
    isCustom: false,
  },
  {
    subagentType: 'performance-engineer',
    displayName: 'Performance Engineer',
    description: '측정 기반 성능 분석·병목 제거',
    icon: '⚡',
    isCustom: false,
  },
  {
    subagentType: 'Plan',
    displayName: 'Plan',
    description: '구현 계획·파일 목록·아키텍처 트레이드오프',
    icon: '📋',
    isCustom: false,
  },
  {
    subagentType: 'pm-agent',
    displayName: 'PM Agent',
    description: '자가 개선 워크플로우·문서화·지식 베이스',
    icon: '🗂️',
    isCustom: false,
  },
  {
    subagentType: 'python-expert',
    displayName: 'Python Expert',
    description: 'SOLID 원칙 기반 프로덕션 Python',
    icon: '🐍',
    isCustom: false,
  },
  {
    subagentType: 'quality-engineer',
    displayName: 'Quality Engineer',
    description: '테스트 전략·엣지 케이스 체계적 탐지',
    icon: '🧪',
    isCustom: false,
  },
  {
    subagentType: 'refactoring-expert',
    displayName: 'Refactoring Expert',
    description: '기술 부채 감소·리팩터링 체계화',
    icon: '🔧',
    isCustom: false,
  },
  {
    subagentType: 'requirements-analyst',
    displayName: 'Requirements Analyst',
    description: '모호한 아이디어 → 구체적 스펙 변환',
    icon: '📝',
    isCustom: false,
  },
  {
    subagentType: 'root-cause-analyst',
    displayName: 'Root Cause Analyst',
    description: '복잡 문제 근본 원인 가설 검증',
    icon: '🕵️',
    isCustom: false,
  },
  {
    subagentType: 'security-engineer',
    displayName: 'Security Engineer',
    description: '취약점 식별·보안 표준 준수',
    icon: '🛡️',
    isCustom: false,
  },
  {
    subagentType: 'socratic-mentor',
    displayName: 'Socratic Mentor',
    description: '질문 기반 발견 학습 유도',
    icon: '🏛️',
    isCustom: false,
  },
  {
    subagentType: 'statusline-setup',
    displayName: 'Statusline Setup',
    description: 'Claude Code 상태 줄 구성',
    icon: '📊',
    isCustom: false,
  },
  {
    subagentType: 'system-architect',
    displayName: 'System Architect',
    description: '확장성·유지보수성 중심 시스템 아키텍처',
    icon: '🏗️',
    isCustom: false,
  },
  {
    subagentType: 'technical-writer',
    displayName: 'Technical Writer',
    description: '타겟 독자 맞춤 기술 문서',
    icon: '✍️',
    isCustom: false,
  },
];

/** O(1) 조회용 맵 */
export const BUILTIN_AGENTS_BY_TYPE: Record<string, ClaudeAgentEntry> = Object.fromEntries(
  BUILTIN_AGENTS.map((a) => [a.subagentType, a]),
);
