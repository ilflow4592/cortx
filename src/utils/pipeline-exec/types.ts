/**
 * Shared types for the pipeline execution module.
 */

export interface PipelineCallbacks {
  onRunning?: () => void;
  onAsking?: () => void;
  /** 파이프라인이 끝났는데 마지막 assistant 메시지가 질문이 아닌 경우 호출. Asking 뱃지 제거 용도. */
  onNotAsking?: () => void;
  onDone?: () => void;
}
