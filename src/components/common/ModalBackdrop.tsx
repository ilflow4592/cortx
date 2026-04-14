/**
 * 모달 오버레이/다이얼로그 공용 래퍼 — a11y 준수.
 *
 * 기존 패턴 `<div className="modal-overlay" onClick={onClose}>` 직접 사용은
 * jsx-a11y rule 위반 (role + keyboard handler 누락). 이 컴포넌트를 대신 사용:
 * - Escape 키로 닫기 (document level)
 * - 배경 클릭으로 닫기 (오버레이 자체 클릭만 — 자식은 이벤트 버블 차단)
 * - `role="dialog"` + `aria-modal="true"`로 스크린리더 힌트
 */
import { useEffect, type ReactNode, type MouseEvent, type KeyboardEvent, type CSSProperties } from 'react';

interface ModalBackdropProps {
  onClose: () => void;
  children: ReactNode;
  /** 기본 `modal-overlay`. 커스텀 레이어가 필요할 때만 override */
  className?: string;
  /** dialog 내용 컨테이너 클래스 */
  dialogClassName?: string;
  /** dialog 인라인 스타일 — 주로 고정 width 지정용 */
  dialogStyle?: CSSProperties;
  /** true(기본): ModalBackdrop이 dialog 래퍼까지 제공. false: children 직접 rendering */
  dialog?: boolean;
  /** accessibility label — 기본 'Dialog' */
  ariaLabel?: string;
}

export function ModalBackdrop({
  onClose,
  children,
  className = 'modal-overlay',
  dialogClassName = 'modal',
  dialogStyle,
  dialog = true,
  ariaLabel = 'Dialog',
}: ModalBackdropProps) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const onBackdropKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        onClose();
      }
    }
  };

  // 배경 클릭 시 e.target === e.currentTarget 검사로 자식 영역 클릭은 자동 무시 —
  // stopPropagation 불필요 (role="dialog"에 onClick 붙이면 a11y 규칙 걸림).
  return (
    <div
      className={className}
      role="button"
      tabIndex={-1}
      aria-label={`${ariaLabel} backdrop — click or press Escape to close`}
      onClick={onBackdropClick}
      onKeyDown={onBackdropKey}
    >
      {dialog ? (
        <div className={dialogClassName} style={dialogStyle} role="dialog" aria-modal="true" aria-label={ariaLabel}>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
