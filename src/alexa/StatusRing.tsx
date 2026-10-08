export type RingState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'approval' | 'error';

const LABEL: Record<RingState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  approval: 'Waiting for approval',
  error: 'Something went wrong',
};

const RING_CSS = `
.agora-ring { width: 8.5rem; height: 8.5rem; border-radius: 999px; display: grid; place-items: center; border: 2px solid rgba(252,250,244,0.18); }
.agora-ring-core { width: 6.4rem; height: 6.4rem; border-radius: 999px; border: 7px solid #17150f; box-shadow: inset 0 0 0 2px rgba(242,204,70,0.45); background: #17150f; }
.agora-ring-listening .agora-ring-core { box-shadow: 0 0 0 7px rgba(242,204,70,0.35); animation: agora-pulse 1.3s ease-in-out infinite; }
.agora-ring-speaking .agora-ring-core { box-shadow: 0 0 0 6px rgba(242,204,70,0.55); }
.agora-ring-thinking .agora-ring-core { border-top-color: #f2cc46; animation: agora-spin 1s linear infinite; }
.agora-ring-approval .agora-ring-core { box-shadow: 0 0 0 8px rgba(217,175,27,0.55); animation: agora-pulse 1.1s ease-in-out infinite; }
.agora-ring-error .agora-ring-core { border-style: dashed; border-color: #f2cc46; }
@keyframes agora-spin { to { transform: rotate(360deg); } }
@keyframes agora-pulse { 50% { box-shadow: 0 0 0 2px rgba(242,204,70,0.18); } }
@media (prefers-reduced-motion: reduce) {
  .agora-ring-core { animation: none !important; }
}
`;

export function StatusRing({ state }: { state: RingState }) {
  return (
    <div className={`agora-ring agora-ring-${state}`} role="img" aria-label={LABEL[state]}>
      <div className="agora-ring-core" />
      <style>{RING_CSS}</style>
    </div>
  );
}
