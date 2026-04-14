import type { en } from './en';

/** Korean translations — missing keys fall back to English. */
export const ko: Partial<typeof en> = {
  // Common
  'common.cancel': '취소',
  'common.save': '저장',
  'common.delete': '삭제',
  'common.close': '닫기',
  'common.retry': '다시 시도',
  'common.confirm': '확인',
  'common.loading': '로딩 중...',
  'common.saving': '저장 중...',
  'common.deleting': '삭제 중...',
  'common.saved': '저장됨',
  'common.unsaved': '저장되지 않은 변경사항',

  // Tabs
  'tab.claude': 'Claude',
  'tab.terminal': '터미널',
  'tab.contextPack': '컨텍스트 팩',

  // Right panel tabs
  'rp.dashboard': '대시보드',
  'rp.worktree': '워크트리',
  'rp.context': '컨텍스트',
  'rp.history': '히스토리',
  'rp.projects': '프로젝트',
  'rp.changes': '변경사항',

  // Task statuses
  'task.status.waiting': '대기',
  'task.status.active': '진행 중',
  'task.status.paused': '일시정지',
  'task.status.done': '완료',

  // Actions
  'action.start': '시작',
  'action.pause': '일시정지',
  'action.resume': '재개',
  'action.done': '완료',
  'action.newTask': '새 작업',
  'action.newProject': '새 프로젝트',
  'action.openSettings': '설정 열기',
  'action.dailyReport': '오늘의 리포트',
  'action.toggleSidebar': '사이드바 토글',
  'action.toggleRightPanel': '우측 패널 토글',
  'action.runPipeline': '파이프라인 실행',
  'action.stopClaude': 'Claude 프로세스 중지',
  'action.markDone': '완료 처리',
  'action.worktreeCleanup': '워크트리 정리',
  'action.manageMcp': 'MCP 서버 관리',
  'action.slashBuilder': '슬래시 명령어 빌더',
  'action.checkUpdates': '업데이트 확인',
  'action.editPipelineConfig': '파이프라인 설정 편집',
  'action.exportMd': '현재 작업 내보내기 (Markdown)',
  'action.exportJson': '현재 작업 내보내기 (JSON)',
  'action.importJson': 'JSON에서 작업 가져오기',

  // Empty states
  'empty.noActiveTask': '활성 작업 없음',
  'empty.noActiveTask.sub': '작업을 선택하거나 새로 만드세요',
  'empty.claudeCode': 'Claude Code',
  'empty.claudeCode.sub1': 'Claude CLI 인증을 사용합니다.',
  'empty.claudeCode.sub2': 'API 키나 크레딧이 필요 없습니다.',
  'empty.noPipeline': '활성 파이프라인 없음',
  'empty.noRepo': '저장소 없음',
  'empty.noChanges': '변경사항 없음',

  // Chat
  'chat.thinking': 'Claude가 생각 중...',
  'chat.placeholder': '메시지를 입력하거나 /를 눌러 명령을 실행하세요...',
  'chat.you': '나',
  'chat.claudeCode': 'Claude Code',

  // Status bar
  'status.sidebar': '사이드바',
  'status.panel': '패널',
  'status.palette': '팔레트',
  'status.pause': '일시정지',
  'status.resume': '재개',

  // Today summary
  'today.title': '오늘',
  'today.report': '리포트',
  'today.focus': '집중',
  'today.interrupts': '중단',
  'today.done': '완료',

  // Settings
  'settings.title': '설정',
  'settings.aiProvider': 'AI 제공자',
  'settings.contextSources': '컨텍스트 소스',
  'settings.appearance': '외관',
  'settings.theme': '테마',
  'settings.language': '언어',
  'settings.theme.dark': '다크',
  'settings.theme.midnight': '미드나잇',
  'settings.theme.light': '라이트',
  'settings.theme.dark.desc': '기본 Cortx teal 테마',
  'settings.theme.midnight.desc': '보라 액센트의 깊은 검정',
  'settings.theme.light.desc': '주간에 최적화된 밝은 테마',

  // Command Palette
  'palette.search': '작업, 프로젝트, 액션 검색...',
  'palette.noResults': '결과 없음.',
  'palette.actions': '액션',
  'palette.tasks': '작업',
  'palette.projects': '프로젝트',
  'palette.chatMessages': '채팅 메시지',
  'palette.currentTask': '현재 작업',

  // Pipeline
  'pipeline.grill_me': 'Grill-me',
  'pipeline.obsidian_save': '저장',
  'pipeline.dev_plan': '개발 계획',
  'pipeline.implement': '구현',
  'pipeline.commit_pr': 'PR',
  'pipeline.review_loop': '리뷰',
  'pipeline.done': '완료',

  // New Task Modal
  'newTask.title': '새 작업',
  'newTask.taskTitle': '작업 제목',
  'newTask.project': '프로젝트',
  'newTask.layer': '레이어',
  'newTask.branchName': '브랜치 이름',
  'newTask.create': '작업 생성',
  'newTask.creating': '생성 중...',
  'newTask.noProject': '프로젝트 없음',

  // New Project Modal
  'newProject.title': '새 프로젝트',
  'newProject.openExisting': '프로젝트 열기',
  'newProject.openExistingDesc': '기존 로컬 폴더 선택',
  'newProject.cloneFromUrl': 'URL에서 클론',
  'newProject.cloneFromUrlDesc': 'Git 저장소 클론',

  // Reset Session
  'reset.title': '세션 리셋',
  'reset.warning': '모든 메시지, 세션, 파이프라인 상태가 초기화되고 커밋되지 않은 변경사항도 모두 되돌려집니다. 되돌릴 수 없습니다.',
  'reset.confirm': '세션 리셋',

  // Crash Recovery
  'crash.title': '중단된 파이프라인이 있습니다',
  'crash.description': '이 작업들은 앱이 비정상 종료될 때 실행 중이었습니다.',
  'crash.resume': '재개',
  'crash.cancel': '취소',
  'crash.dismissAll': '모두 취소',

  // Confirmation
  'confirm.deleteTask': '이 작업을 삭제하시겠습니까?',
  'confirm.deleteProject': '이 프로젝트를 삭제하시겠습니까?',
  'confirm.unsaved': '저장되지 않은 변경사항이 있습니다. 계속하시겠습니까?',
};
