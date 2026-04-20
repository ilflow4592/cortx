import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { MODEL_VERSIONS, MODEL_ALIAS_TO_LABEL, effortLevelsFor, type EffortLevel } from '../../constants/pipeline';

export type ModelAlias = 'opus' | 'sonnet' | 'haiku';

interface ModelPickerProps {
  model: ModelAlias | null;
  effort: EffortLevel | null;
  onChangeModel: (m: ModelAlias) => void;
  onChangeEffort: (e: EffortLevel) => void;
  onClose: () => void;
}

const MODEL_OPTIONS: { alias: ModelAlias; desc: string }[] = [
  { alias: 'opus', desc: 'Most capable for complex work' },
  { alias: 'sonnet', desc: 'Best for everyday tasks' },
  { alias: 'haiku', desc: 'Fastest for quick answers' },
];

export function ModelPicker({ model, effort, onChangeModel, onChangeEffort, onClose }: ModelPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const activeModel: ModelAlias = model ?? 'opus';
  const activeEffort: EffortLevel = effort ?? 'medium';

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Model & effort picker"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        width: 320,
        background: 'var(--bg-panel-alt)',
        border: '1px solid var(--border-strong)',
        borderRadius: 10,
        padding: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        zIndex: 50,
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: 'var(--fg-faint)',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          padding: '4px 6px 6px',
        }}
      >
        Model
      </div>
      {MODEL_OPTIONS.map((opt) => {
        const label = MODEL_ALIAS_TO_LABEL[opt.alias];
        const version = MODEL_VERSIONS[label] || '';
        const selected = opt.alias === activeModel;
        return (
          <button
            key={opt.alias}
            type="button"
            onClick={() => onChangeModel(opt.alias)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '7px 8px',
              background: selected ? 'var(--accent-bg)' : 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--fg-primary)',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
              {selected && <Check size={12} color="var(--accent-bright)" strokeWidth={2.5} />}
            </span>
            <span style={{ fontSize: 12, fontWeight: selected ? 600 : 500, minWidth: 80 }}>
              {label} {version}
            </span>
            <span style={{ fontSize: 10, color: 'var(--fg-muted)', flex: 1 }}>{opt.desc}</span>
          </button>
        );
      })}

      <div
        style={{
          height: 1,
          background: 'var(--border-muted)',
          margin: '10px 0 8px',
        }}
      />

      <div
        style={{
          fontSize: 10,
          color: 'var(--fg-faint)',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          padding: '0 6px 10px',
        }}
      >
        Effort
      </div>
      <EffortStepper active={activeEffort} levels={effortLevelsFor(activeModel)} onChange={onChangeEffort} />
    </div>
  );
}

function EffortStepper({
  active,
  levels,
  onChange,
}: {
  active: EffortLevel;
  levels: readonly EffortLevel[];
  onChange: (e: EffortLevel) => void;
}) {
  const activeIdx = Math.max(0, levels.indexOf(active));
  return (
    <div style={{ padding: '0 10px 8px', position: 'relative' }}>
      <div style={{ position: 'relative', height: 28 }}>
        {/* base line */}
        <div
          style={{
            position: 'absolute',
            top: 13,
            left: 7,
            right: 7,
            height: 2,
            background: 'var(--border-strong)',
            borderRadius: 1,
          }}
        />
        {/* filled line up to active */}
        <div
          style={{
            position: 'absolute',
            top: 13,
            left: 7,
            width: `calc((100% - 14px) * ${activeIdx} / ${levels.length - 1})`,
            height: 2,
            background: 'var(--accent-bright)',
            borderRadius: 1,
            transition: 'width 160ms ease',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: '100%',
          }}
        >
          {levels.map((lv, i) => {
            const filled = i <= activeIdx;
            const isActive = i === activeIdx;
            return (
              <button
                key={lv}
                type="button"
                onClick={() => onChange(lv)}
                title={lv}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: filled ? 'var(--accent-bright)' : 'var(--bg-panel-alt)',
                  border: `2px solid ${filled ? 'var(--accent-bright)' : 'var(--border-strong)'}`,
                  cursor: 'pointer',
                  padding: 0,
                  zIndex: 1,
                  boxShadow: isActive ? '0 0 0 3px var(--accent-bg)' : 'none',
                  transition: 'all 140ms ease',
                }}
                aria-label={`effort ${lv}`}
              />
            );
          })}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontSize: 10,
          color: 'var(--fg-muted)',
        }}
      >
        {levels.map((lv) => (
          <span
            key={lv}
            style={{
              flex: 1,
              textAlign: 'center',
              color: lv === active ? 'var(--accent-bright)' : 'var(--fg-muted)',
              fontWeight: lv === active ? 600 : 400,
            }}
          >
            {lv}
          </span>
        ))}
      </div>
    </div>
  );
}
