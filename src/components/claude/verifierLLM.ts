/**
 * Verifier LLM — 소형 Haiku 모델로 복잡한 규칙 평가.
 *
 * 정규식으로 판정 불가능한 시맨틱 규칙 검증용.
 * 예: "답변이 충분한가?", "근거가 제시되었나?", "톤이 공격적이지 않은가?"
 *
 * 비용/지연 때문에 모든 턴이 아닌 **명시적 호출 시**만 사용.
 * 1회 호출 ≈ Haiku 입력/출력 합산 1-2K tokens (~$0.001).
 */
import { useSettingsStore } from '../../stores/settingsStore';

// Tauri 동적 import 래퍼 (CLAUDE.md 규칙)
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export type VerifierVerdict = 'pass' | 'fail' | 'inconclusive';

export interface VerifierResult {
  verdict: VerifierVerdict;
  reason: string;
}

/**
 * 응답 텍스트를 주어진 규칙에 대해 평가.
 *
 * @param rule 자연어 평가 기준 (예: "응답에 근거가 제시되었는가?")
 * @param responseText Claude의 원본 응답
 * @returns pass/fail/inconclusive + 간단한 이유
 */
export async function verifyWithLLM(rule: string, responseText: string): Promise<VerifierResult> {
  // 사용자가 opt-in 한 경우만 실행
  const enabled = useSettingsStore.getState().verifierLlmEnabled ?? false;
  if (!enabled) {
    return { verdict: 'inconclusive', reason: 'Verifier LLM disabled in settings' };
  }

  const prompt = buildVerifierPrompt(rule, responseText);

  try {
    const result = await invoke<{ success: boolean; output: string; stderr?: string }>('run_shell_command', {
      cwd: '/',
      command: `echo ${shellEscape(prompt)} | claude -p - --model claude-haiku-4-5-20251001 --max-turns 1 --output-format text`,
    });

    if (!result.success || !result.output) {
      return { verdict: 'inconclusive', reason: 'Verifier invocation failed' };
    }

    return parseVerifierOutput(result.output);
  } catch (err) {
    return { verdict: 'inconclusive', reason: `Error: ${String(err).slice(0, 80)}` };
  }
}

/**
 * Verifier용 프롬프트 빌더 — 짧고 강제된 출력 포맷.
 * 반드시 "VERDICT: PASS|FAIL|INCONCLUSIVE" + "REASON: ..." 형식으로 답하도록 강제.
 */
export function buildVerifierPrompt(rule: string, responseText: string): string {
  return `You are a rule verifier. Answer in exactly this format, nothing else:
VERDICT: PASS|FAIL|INCONCLUSIVE
REASON: <one sentence, under 100 chars>

Rule: ${rule}

Response to evaluate:
---
${responseText.slice(0, 4000)}
---

Evaluate whether the response satisfies the rule. Answer now:`;
}

/**
 * Verifier 출력 파싱. 포맷 위반 시 inconclusive 반환.
 */
export function parseVerifierOutput(output: string): VerifierResult {
  const verdictMatch = output.match(/VERDICT:\s*(PASS|FAIL|INCONCLUSIVE)/i);
  const reasonMatch = output.match(/REASON:\s*(.+?)(?:\n|$)/);

  if (!verdictMatch) {
    return { verdict: 'inconclusive', reason: 'Malformed verifier output' };
  }

  const raw = verdictMatch[1].toUpperCase();
  const verdict: VerifierVerdict = raw === 'PASS' ? 'pass' : raw === 'FAIL' ? 'fail' : 'inconclusive';
  const reason = reasonMatch?.[1]?.trim().slice(0, 200) ?? '';

  return { verdict, reason };
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
