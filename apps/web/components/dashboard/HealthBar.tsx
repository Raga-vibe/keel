import { DEFAULT_POLICY } from "@keel/hedge-sdk";
import { pct } from "@/lib/format";

/** Distance to liquidation on a 0–60% scale, with the guardian's thresholds marked. */
export function HealthBar({ distance }: { distance: number | null }) {
  if (distance === null) return <div className="text-xs text-muted">No live position</div>;
  const scale = 0.6;
  const d = Math.min(Math.max(distance, 0), scale);
  const status =
    distance < DEFAULT_POLICY.criticalDistance ? "critical" : distance < DEFAULT_POLICY.warnDistance ? "watch" : "healthy";
  const color = status === "critical" ? "var(--bad)" : status === "watch" ? "var(--warn)" : "var(--good)";
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Distance to liquidation</span>
        <span className="num" style={{ color }}>
          {!Number.isFinite(distance) ? "none" : distance >= 1 ? ">100%" : pct(distance, 0)} · {status}
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-surface-2">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(d / scale) * 100}%`, background: color }} />
        {[DEFAULT_POLICY.criticalDistance, DEFAULT_POLICY.warnDistance].map((t) => (
          <div key={t} className="absolute -top-0.5 h-3 w-px bg-ink-2/50" style={{ left: `${(t / scale) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}
