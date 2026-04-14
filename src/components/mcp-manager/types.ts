/** MCP 서버 CRUD에 사용되는 공통 타입. */

/** Tauri에서 돌아오는 raw 서버 레코드 */
export interface RawServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  server_type: string;
  url: string;
}

/** 폼 편집용 draft — args/env를 문자열 형태로 둔다 */
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
