import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEV_TASK_PATH = join(__dirname, '..', '..', '.claude', 'commands', 'pipeline', 'dev-task.md');

describe('.claude/commands/pipeline/dev-task.md', () => {
  const content = readFileSync(DEV_TASK_PATH, 'utf-8');

  it('교차 검증 필수 문구가 제거됨 (Claude의 Notion MCP 재쿼리 유인 제거)', () => {
    expect(content).not.toContain('코드베이스와 교차 검증 필수');
  });

  it('fullText 있을 때 MCP 재호출 금지 조건부 규칙이 명시됨', () => {
    expect(content).toMatch(/fullText.+있으면.+MCP.+재호출 금지/);
    expect(content).toContain('mcp__notion__*');
    expect(content).toContain('mcp__slack__*');
    expect(content).toContain('mcp__github__*');
  });

  it('Q1 출력 전 탐색 도구 호출 금지가 명시됨', () => {
    expect(content).toMatch(/첫 질문.+전까지 Grep\/Glob\/Read\/Bash 호출 금지/);
  });

  it('Q1 출력 이후에만 Read 허용 규칙이 존재', () => {
    expect(content).toMatch(/Q1\.[^\n]*?출력 이후에만 Read 허용/);
  });

  it('grill_me pipeline marker가 보존됨 (runPipeline 상태 추적 호환)', () => {
    expect(content).toContain('[PIPELINE:grill_me:in_progress]');
    expect(content).toContain('[PIPELINE:grill_me:done]');
  });

  it('CORTX_PROJECT_CONTEXT pre-load 안내가 유지됨 (이전 최적화 회귀 방지)', () => {
    expect(content).toContain('CORTX_PROJECT_CONTEXT');
    expect(content).toMatch(/Read 도구로 다시 읽지 마세요/);
  });
});
