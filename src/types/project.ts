/**
 * @module types/project
 * 프로젝트 도메인 타입 정의.
 * 프로젝트는 GitHub 저장소와 1:1로 매핑되며, 여러 Task를 그룹핑한다.
 */

/** 프로젝트 — GitHub 저장소 기반의 작업 그룹 */
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
}
