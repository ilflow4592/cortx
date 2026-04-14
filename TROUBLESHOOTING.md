# Troubleshooting

알려진 한계 + 자주 만나는 이슈.

## Pipeline 마커

### `[PIPELINE:pr:<NUMBER>:url]` 마커가 매칭되지 않음

**원인**: `src/components/claude/pipelineMarkers.ts`의 정규식이
`[PIPELINE:key:value]`에서 value 위치를 `[a-zA-Z_]+`로 제한 — digits 불가.

**우회**: PR 번호는 `commit_pr` 단계의 memo 필드로 표현:
```
[PIPELINE:commit_pr:done:PR #4920]
```

**해결 시점**: 기존 마커 포맷과 호환 위해 보류. 수정하면 `([^\]:]+)`로
완화 + 테스트 갱신 필요.

## 데이터 마이그레이션

### localStorage → SQLite 이전 후 데이터 보이지 않음

**원인**: `loadTasks` / `loadProjects`에서 새 필드 기본값 누락.
`CLAUDE.md`의 Data Migration 섹션 참고.

**해결**: `src/services/db/` 각 loader에서 모든 필드에 fallback 추가.

## Tauri Webview

### "window is not defined" / `getCurrentWindow` 실패

**원인**: `@tauri-apps/api`를 static import하면 webview 초기화 전 평가돼 깨짐.

**해결**: 모든 Tauri API는 dynamic import 사용. CLAUDE.md `Tauri API Imports`
섹션 + quality-gate hook이 차단.

## Build Warnings

### `INEFFECTIVE_DYNAMIC_IMPORT`

**원인**: 같은 모듈을 한쪽은 dynamic, 다른쪽은 static으로 import — chunk
splitting 무력화.

**해결**: 모든 import를 한 가지 방식으로 통일. 현재 Tauri plugins는 dynamic,
domain stores/utils는 static으로 일관.

### "chunks larger than 500kB"

**원인**: xterm / cmdk 등 큰 vendor가 main bundle에 포함.

**해결**: `vite.config.ts`의 `manualChunks`로 vendor 분리. 현재 monaco /
xterm / tauri / react / cmdk 등 독립 chunk.

## 테스트

### "setState called within an effect"

**원인**: `react-hooks/set-state-in-effect` 룰. effect 내 sync setState는
cascading render 유발.

**해결**: 
- 외부 store 변경 동기화가 목적이면 `eslint-disable-next-line` 주석 + 이유
- 아니면 state 대신 derived value 사용 또는 handler로 이동

예시: `MainPanel.tsx`의 `terminalEverActive` — useEffect 대신 `selectTab`
useCallback에서 같이 처리.

## 디버깅

### cargo test 실패 — ts-rs export가 안 됨

**원인**: `export_to` 경로가 잘못됐거나 파일 이동 후 경로 무효.

**해결**: `../../src/types/generated/` (crate root 기준 상대 경로)가 올바른
지 확인. 서브모듈로 이동 시 레벨 조정 필요.

### Claude CLI spawn 실패

**원인**: `claude` 바이너리가 PATH에 없거나 `--permission-mode
bypassPermissions` 미지원 버전.

**해결**: `claude --version` 확인, 최신 버전 설치.
