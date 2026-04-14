/**
 * @module types/project
 * 프로젝트 도메인 타입 정의.
 *
 * `ProjectMetadata` 및 관련 타입(DocEntry, DocGrade, SotStatus, ProjectQuality)은
 * Rust 측에서 ts-rs로 자동 생성한다. 수동 동기화 부담을 제거.
 *
 * 재생성: `cd src-tauri && cargo test --lib`
 */
export type { ProjectMetadata } from './generated/ProjectMetadata';
export type { DocEntry } from './generated/DocEntry';
export type { DocGrade } from './generated/DocGrade';
export type { SotStatus } from './generated/SotStatus';
export type { ProjectQuality } from './generated/ProjectQuality';

import type { ProjectMetadata } from './generated/ProjectMetadata';

/** 프로젝트 — GitHub 저장소 기반의 작업 그룹. ts-rs가 다루지 않는 UI-only 필드 포함 */
export interface Project {
  id: string;
  /** 프로젝트 표시 이름 */
  name: string;
  /** 로컬 git 저장소 경로 */
  localPath: string;
  /** GitHub 소유자 (user 또는 org) */
  githubOwner: string;
  /** GitHub 저장소 이름 */
  githubRepo: string;
  /** PR 생성 시 기본 대상 브랜치 */
  baseBranch: string;
  /** 모니터링할 Slack 채널 ID 목록 */
  slackChannels: string[];
  /** UI에서 사용하는 프로젝트 구분 색상 (hex) */
  color: string;
  createdAt: string;
  /** 프로젝트 추가 시 백그라운드 스캔 결과. 스캔 완료 전에는 undefined. */
  metadata?: ProjectMetadata;
}
