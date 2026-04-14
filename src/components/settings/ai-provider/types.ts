/** AI Provider 설정 UI에서 공유하는 타입들. */
import type { AIProvider } from '../../../stores/settingsStore';

export type { AIProvider };

/** 각 프로바이더의 기본 메타데이터 (아이콘/모델/키 발급 경로/안내 문구). */
export interface ProviderConfig {
  value: AIProvider;
  label: string;
  icon: string;
  model: string;
  keyUrl: string;
  keyPageLabel: string;
  placeholder: string;
  steps: string[];
}
