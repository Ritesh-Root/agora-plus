import { meterCopy, type LatencySample } from './turnTiming';

export type { LatencySample };

/** Last ten turns. The median is what we quote in the demo. */
export function LatencyMeter({ samples, className }: { samples: LatencySample[]; className?: string }) {
  return (
    <p className={`text-[13px] leading-relaxed text-zinc-500 tabular-nums ${className ?? 'text-center'}`} data-testid="latency-meter">
      {meterCopy(samples)}
    </p>
  );
}
