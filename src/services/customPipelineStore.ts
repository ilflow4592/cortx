/**
 * Custom pipeline 파일 I/O — Rust command 래퍼.
 * 캐시는 프로젝트 경로 단위. write/delete 시 invalidate.
 *
 * 저장 위치:
 *   user    — ~/.cortx/pipelines/<id>.json
 *   project — <cwd>/.cortx/pipelines/<id>.json (기본값, 팀 공유)
 *
 * 프로젝트 우선 머지 정책은 Rust `list_custom_pipelines` 에서 처리.
 */
import type { CustomPipelineConfig, CustomPipelineMeta, PipelineSource } from '../types/customPipeline';
import { logger } from '../utils/logger';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

const listCache = new Map<string, CustomPipelineMeta[]>();
const cacheKey = (cwd: string | undefined) => cwd || '<global-only>';

/**
 * 글로벌 + 프로젝트 파이프라인을 머지해 반환 (Rust 측에서 project 우선).
 * 같은 cwd 에 대해 반복 호출되면 캐시 사용 → invalidateList 로 무효화.
 */
export async function listCustomPipelines(cwd: string | undefined): Promise<CustomPipelineMeta[]> {
  const key = cacheKey(cwd);
  const cached = listCache.get(key);
  if (cached) return cached;
  try {
    const result = await invoke<CustomPipelineMeta[]>('list_custom_pipelines', { projectCwd: cwd });
    listCache.set(key, result);
    return result;
  } catch (e) {
    logger.error('listCustomPipelines failed:', e);
    return [];
  }
}

export function invalidateList(cwd: string | undefined): void {
  listCache.delete(cacheKey(cwd));
}

/**
 * 파이프라인 본문 로드. JSON 파싱 실패 시 throw.
 */
export async function readCustomPipeline(
  id: string,
  source: PipelineSource,
  cwd: string | undefined,
): Promise<CustomPipelineConfig> {
  const raw = await invoke<string>('read_custom_pipeline', {
    id,
    source,
    projectCwd: cwd,
  });
  const parsed = JSON.parse(raw) as CustomPipelineConfig;
  // source 필드는 런타임 결정 — 파일에 저장된 값이 있어도 현재 로딩 경로로 덮어씀
  // (builtin 도 원본 JSON 에는 source:"project" 로 적혀있을 수 있으니 덮어쓰기)
  parsed.source = source;
  return parsed;
}

export async function writeCustomPipeline(config: CustomPipelineConfig, cwd: string | undefined): Promise<void> {
  const { source, ...rest } = config;
  const serialized = JSON.stringify({ ...rest, source, updatedAt: new Date().toISOString() }, null, 2);
  await invoke<void>('write_custom_pipeline', {
    id: config.id,
    source,
    content: serialized,
    projectCwd: cwd,
  });
  invalidateList(cwd);
}

export async function deleteCustomPipeline(id: string, source: PipelineSource, cwd: string | undefined): Promise<void> {
  await invoke<void>('delete_custom_pipeline', { id, source, projectCwd: cwd });
  invalidateList(cwd);
}

export async function exportCustomPipeline(
  id: string,
  source: PipelineSource,
  destPath: string,
  cwd: string | undefined,
): Promise<void> {
  await invoke<void>('export_custom_pipeline', {
    id,
    source,
    destPath,
    projectCwd: cwd,
  });
}

export async function importCustomPipeline(
  srcPath: string,
  source: PipelineSource,
  cwd: string | undefined,
): Promise<CustomPipelineMeta> {
  const meta = await invoke<CustomPipelineMeta>('import_custom_pipeline', {
    srcPath,
    source,
    projectCwd: cwd,
  });
  invalidateList(cwd);
  return meta;
}

/**
 * 기존 파이프라인을 duplicate — 새 id 로 복사본 저장.
 * 기본 동작: project 로 저장 (팀 공유 목적, 사용자가 Save As 모달에서 변경 가능).
 */
export async function duplicateCustomPipeline(
  srcId: string,
  srcSource: PipelineSource,
  newId: string,
  newName: string,
  targetSource: 'user' | 'project' = 'project', // builtin 은 쓰기 불가
  cwd: string | undefined = undefined,
): Promise<void> {
  const original = await readCustomPipeline(srcId, srcSource, cwd);
  const now = new Date().toISOString();
  const copy: CustomPipelineConfig = {
    ...original,
    id: newId,
    name: newName,
    source: targetSource,
    createdAt: now,
    updatedAt: now,
  };
  await writeCustomPipeline(copy, cwd);
}
