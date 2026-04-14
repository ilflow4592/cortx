interface CreateWorktreeProgressProps {
  creating: boolean;
  status: string;
  error: string;
}

export function CreateWorktreeProgress({ creating, status, error }: CreateWorktreeProgressProps) {
  return (
    <>
      {creating && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(99,102,241,0.04)',
            border: '1px solid rgba(99,102,241,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div className="spinner" />
          <div>
            <div style={{ fontSize: 12, color: '#d4d4d8', fontWeight: 500 }}>{status || 'Creating task...'}</div>
            <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>
              Setting up worktree and environment
            </div>
          </div>
        </div>
      )}
      {error && <div className="error-box">{error}</div>}
    </>
  );
}
