export interface LatencySample {
  ttfsMs: number;
  finalMs: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Last ten turns. The median is what we quote in the demo. */
export function LatencyMeter({ samples }: { samples: LatencySample[] }) {
  const recent = samples.slice(-10);
  const last = recent[recent.length - 1];
  const ttfs = median(recent.map((sample) => sample.ttfsMs));
  const finalMs = median(recent.map((sample) => sample.finalMs));
  return (
    <p className="text-center text-[11px] leading-relaxed text-paper/70" data-testid="latency-meter">
      {last ? `Last turn ${last.ttfsMs} ms to first speech, ${last.finalMs} ms to the answer.` : 'No spoken turn yet.'}
      {ttfs !== null && finalMs !== null ? ` Median of ${recent.length}: ${ttfs} / ${finalMs} ms.` : ''}
    </p>
  );
}
