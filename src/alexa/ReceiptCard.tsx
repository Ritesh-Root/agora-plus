export interface ToolReceipt {
  action?: string;
  id?: string;
  verified?: boolean;
  at?: string;
}

export interface ToolCard {
  name: string;
  status: 'ok' | 'needs_approval' | 'error' | 'running';
  speech: string;
  receipt?: ToolReceipt;
  approvalId?: string;
  summary?: string;
  ms?: number;
}

const CHIP: Record<ToolCard['status'], string> = {
  ok: 'bg-butter text-ink',
  needs_approval: 'bg-[#d9af1b] text-ink',
  error: 'bg-transparent text-paper border border-paper/40',
  running: 'bg-paper/10 text-paper',
};

const CHIP_LABEL: Record<ToolCard['status'], string> = {
  ok: 'ok',
  needs_approval: 'needs approval',
  error: 'error',
  running: 'running',
};

export function ReceiptCard({
  card,
  busy,
  onApprove,
  onDecline,
}: {
  card: ToolCard;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <article className="rounded-2xl border border-paper/15 bg-ink/60 p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-paper">{card.name}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${CHIP[card.status]}`}>
          {CHIP_LABEL[card.status]}
        </span>
      </div>
      {card.speech ? <p className="mt-2 text-sm leading-snug text-paper">{card.speech}</p> : null}
      {card.receipt ? (
        <p className="mt-2 text-[11px] text-paper/70">
          {card.receipt.verified ? 'verified ✓' : 'not verified'}
          {typeof card.ms === 'number' ? ` · ${card.ms} ms` : ''}
        </p>
      ) : typeof card.ms === 'number' ? (
        <p className="mt-2 text-[11px] text-paper/70">{card.ms} ms</p>
      ) : null}
      {card.status === 'needs_approval' ? (
        <div className="mt-3">
          <p className="text-sm text-paper">{card.summary || card.speech}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="flex-1 rounded-full bg-butter px-3 py-2 text-[10px] font-black uppercase tracking-widest text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper disabled:opacity-40"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDecline}
              className="flex-1 rounded-full border border-paper/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butter disabled:opacity-40"
            >
              Decline
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
