import { useState } from 'react';

const steps = [
  {
    icon: '🧠',
    title: 'Welcome to Cortx',
    sub: "Your brain can't hold 5 contexts at once. Cortx can.",
    items: [
      { text: '<strong>Create tasks</strong> with the + button in the dock' },
      { text: 'Each task gets its own <strong>worktree, terminal, and AI chat</strong>' },
      { text: 'Switch tasks without losing context' },
    ],
  },
  {
    icon: '🎯',
    title: '3-Layer Task Model',
    sub: 'Organize 50 tasks like 3.',
    items: [
      { text: '<strong>Focus Slots</strong> — 30min+ deep work tasks (max 3)' },
      { text: '<strong>Batch Queue</strong> — Similar tasks grouped together' },
      { text: '<strong>Reactive</strong> — Quick tasks under 2 minutes' },
    ],
  },
  {
    icon: '📦',
    title: 'Context Pack',
    sub: 'Never ask "what happened while I was away?"',
    items: [
      { text: 'Connect <strong>GitHub, Slack, Notion</strong> in Settings' },
      { text: 'Add <strong>keywords</strong> to auto-collect relevant context' },
      { text: '<strong>Delta detection</strong> shows what changed while you were paused' },
    ],
  },
  {
    icon: '⌨',
    title: 'Keyboard Shortcuts',
    sub: 'Stay in flow without touching the mouse.',
    items: [
      { text: '<strong>⌘⇧P</strong> — Pause current task' },
      { text: '<strong>⌘⇧R</strong> — Resume task' },
      { text: '<strong>⌘1-9</strong> — Switch to task N' },
    ],
  },
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card" key={step}>
        <div className="onboarding-icon">{current.icon}</div>
        <div className="onboarding-title">{current.title}</div>
        <div className="onboarding-sub">{current.sub}</div>

        <div className="onboarding-steps">
          {current.items.map((item, i) => (
            <div key={i} className="onboarding-step">
              <div className="onboarding-step-num">{i + 1}</div>
              <div className="onboarding-step-text" dangerouslySetInnerHTML={{ __html: item.text }} />
            </div>
          ))}
        </div>

        <div className="onboarding-dots">
          {steps.map((_, i) => (
            <div key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
          ))}
        </div>

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {isLast ? (
            <button className="btn btn-primary" onClick={onComplete}>
              Get Started
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          )}
          {!isLast && (
            <button className="btn btn-ghost" onClick={onComplete} style={{ fontSize: 11 }}>
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
