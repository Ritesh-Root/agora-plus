import type { RefObject } from 'react';
import { ReceiptCard } from '../alexa/ReceiptCard';
import { LatencyMeter, type LatencySample } from '../alexa/LatencyMeter';
import { authLabel, type SimStatus, type TraceTurn } from '../alexa/useAssistant';
import { Sheet } from './Sheet';
import { focusRing } from './ui';

/** Spyglass, 30 Sep 2025. Listed in docs/research/sources.json. */
const ALEXA_WAIT_SOURCE = 'https://spyglass.org/broken-alexa-plus/';
/** The Verge, 8 Oct 2026, one-year Alexa+ review. */
const VERGE_WAIT_SOURCE = 'https://www.theverge.com/tech/1007565/amazon-alexa-plus-review-one-year-echo-show-dot-max';

export function UnderTheHood({
  open,
  onClose,
  turns,
  samples,
  status,
  busy,
  onDecide,
  traceRef,
}: {
  open: boolean;
  onClose: () => void;
  turns: TraceTurn[];
  samples: LatencySample[];
  status: SimStatus | null;
  busy: boolean;
  onDecide: (utterance: string) => void;
  traceRef: RefObject<HTMLOListElement | null>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Under the hood" testId="alexa-trace" fill modal={false}>
      <div className="shrink-0 space-y-3">
        <p className="text-[13px] leading-relaxed text-zinc-500">
          MCP · Streamable HTTP · 2025-11-25 · auth: {authLabel(status)}
        </p>
        <LatencyMeter samples={samples} className="text-left" />
        <p className="text-[13px] leading-relaxed text-zinc-500">
          Reported Alexa+ wait: up to 15 s (<a href={ALEXA_WAIT_SOURCE} className={`underline decoration-zinc-300 underline-offset-2 ${focusRing}`}>Spyglass, Sep 2025</a>) and 3-5 s for simple commands (<a href={VERGE_WAIT_SOURCE} className={`underline decoration-zinc-300 underline-offset-2 ${focusRing}`}>The Verge, Oct 2026</a>). This meter is time to first audio.
        </p>
      </div>
      <ol ref={traceRef} className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {turns.length === 0 ? <li className="text-[13px] text-zinc-500">No turn yet.</li> : null}
        {turns.map((turn) => (
          <li key={turn.id} className="rounded-2xl bg-zinc-50 p-3">
            <p className="text-sm leading-snug text-ink">{turn.utterance}</p>
            <p className="mt-2 text-[13px] tabular-nums text-zinc-500">
              <span className="font-mono">ack</span>
              {turn.ackText ? ` · ${turn.ackText}` : ''}
              {typeof turn.ackMs === 'number' ? ` · ${turn.ackMs} ms` : ''}
            </p>
            {turn.route ? (
              <p className="mt-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${turn.route === 'fast' ? 'bg-butter text-ink' : 'bg-zinc-100 text-ink'}`}>
                  {turn.route === 'fast' ? 'fast path · no model' : `model · ${status?.model || 'server model'}`}
                </span>
              </p>
            ) : null}
            {turn.tools.length > 0 ? (
              <div className="mt-2 space-y-2">
                {turn.tools.map((card, index) => (
                  <div key={`${card.name}-${index}`}>
                    <p className="mb-1 font-mono text-[12px] text-zinc-500">tools/call</p>
                    <ReceiptCard card={card} busy={busy} showActions={false} onApprove={() => onDecide('yes')} onDecline={() => onDecide('no')} />
                  </div>
                ))}
              </div>
            ) : null}
            {turn.errorDetail ? <p className="mt-2 break-words font-mono text-[12px] leading-relaxed text-coral">{turn.errorDetail}</p> : null}
            {typeof turn.totalMs === 'number' ? <p className="mt-2 text-[13px] tabular-nums text-zinc-500">final · {turn.totalMs} ms</p> : null}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
