/** MCP 서버 CRUD에 사용되는 타입. RawServer는 ts-rs로 자동 생성된 McpServerInfo
 *  중 UI에서 필요한 부분만 추려 alias한다. */
import type { McpServerInfo } from '../../types/generated/McpServerInfo';

/** 백엔드에서 돌아오는 서버 레코드 (source/disabled는 UI에서 별도 처리) */
export type RawServer = Omit<McpServerInfo, 'source' | 'disabled'>;

/** 폼 편집용 draft — args/env를 문자열 형태로 두어 입력 편의 향상 */
export interface DraftServer {
  name: string;
  type: 'stdio' | 'http';
  command: string;
  /** space-separated */
  args: string;
  /** KEY=value per line */
  envText: string;
  url: string;
}
