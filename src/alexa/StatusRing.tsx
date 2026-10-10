export type RingState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'approval' | 'error';

export const RING_LABEL: Record<RingState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  approval: 'Waiting for approval',
  error: 'Something went wrong',
};

const RING_CSS = `
.agora-ring { position: relative; width: 7.5rem; height: 7.5rem; border-radius: 999px; display: grid; place-items: center; background: #fcfaf4; box-shadow: 0 0 0 8px rgba(242,204,70,0.38); transition: box-shadow 200ms ease; }
.agora-ring-core { position: relative; width: 5.35rem; height: 5.35rem; border-radius: 999px; background: #fcfaf4; box-shadow: inset 0 0 0 7px #f2cc46; }
.agora-ring-sweep { position: absolute; inset: 0; border-radius: inherit; opacity: 0; }
.agora-ring-listening { animation: agora-pulse 1.3s ease-in-out infinite; }
.agora-ring-thinking .agora-ring-sweep { opacity: 1; background: conic-gradient(from 0deg, transparent 0 58%, #f2cc46 82%, transparent 100%); animation: agora-spin 2.4s linear infinite; mask: radial-gradient(farthest-side, transparent calc(100% - 9px), #000 calc(100% - 7px)); }
.agora-ring-speaking { animation: agora-wave 1.15s ease-in-out infinite; }
.agora-ring-approval { box-shadow: 0 0 0 8px rgba(217,175,27,0.72); animation: agora-pulse 1.1s ease-in-out infinite; }
.agora-ring-approval .agora-ring-core { box-shadow: inset 0 0 0 7px #d9af1b; }
.agora-ring-error { box-shadow: 0 0 0 8px rgba(196,85,58,0.4); }
.agora-ring-error .agora-ring-core { box-shadow: inset 0 0 0 7px #c4553a; }
@keyframes agora-spin { to { transform: rotate(360deg); } }
@keyframes agora-pulse { 50% { box-shadow: 0 0 0 3px rgba(242,204,70,0.22); } }
@keyframes agora-wave {
  0%, 100% { box-shadow: 0 0 0 8px rgba(242,204,70,0.62); }
  50% { box-shadow: 0 0 0 8px rgba(23,21,15,0.28); }
}
@media (prefers-reduced-motion: reduce) {
  .agora-ring, .agora-ring-core, .agora-ring-sweep { animation: none !important; transition: none !important; }
}
`;

export function StatusRing({ state }: { state: RingState }) {
  return (
    <div className={`agora-ring agora-ring-${state}`} role="img" aria-label={RING_LABEL[state]}>
      <div className="agora-ring-sweep" />
      <div className="agora-ring-core" />
      <style>{RING_CSS}</style>
    </div>
  );
}
