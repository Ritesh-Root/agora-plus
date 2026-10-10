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
  ok: 'bg-sage/15 text-sage',
  needs_approval: 'bg-butter text-ink',
  error: 'bg-coral/10 text-coral',
  running: 'bg-zinc-100 text-zinc-600',
};

const CHIP_LABEL: Record<ToolCard['status'], string> = {
  ok: 'ok',
  needs_approval: 'needs approval',
  error: 'error',
  running: 'running',
};

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

export function ReceiptCard({
  card,
  busy,
  onApprove,
  onDecline,
  showActions = true,
}: {
  card: ToolCard;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
  showActions?: boolean;
}) {
  return (
    <article className="rounded-2xl bg-zinc-50 p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[12px] text-ink">{card.name}</p>
        <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${CHIP[card.status]}`}>
          {CHIP_LABEL[card.status]}
        </span>
      </div>
      {card.speech ? <p className="mt-2 text-sm leading-snug text-ink">{card.speech}</p> : null}
      {card.summary && card.summary !== card.speech ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-snug text-zinc-600">{card.summary}</p>
      ) : null}
      {card.receipt ? (
        <p className={`mt-2 text-[13px] tabular-nums ${card.receipt.verified ? 'text-sage' : 'text-coral'}`}>
          {card.receipt.verified ? 'verified ✓' : 'not verified'}
          {typeof card.ms === 'number' ? ` · ${card.ms} ms` : ''}
        </p>
      ) : typeof card.ms === 'number' ? (
        <p className="mt-2 text-[13px] tabular-nums text-zinc-500">{card.ms} ms</p>
      ) : null}
      {card.status === 'needs_approval' && showActions ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className={`flex-1 rounded-full bg-ink px-3 py-2 text-sm font-medium text-paper transition-transform duration-150 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing} disabled:opacity-40`}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-medium text-ink transition-transform duration-150 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing} disabled:opacity-40`}
          >
            Decline
          </button>
        </div>
      ) : null}
    </article>
  );
}
