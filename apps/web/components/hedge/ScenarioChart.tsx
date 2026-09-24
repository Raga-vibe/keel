import type { HedgePlan, Scenario } from "@keel/hedge-sdk";
import { usd } from "@/lib/format";

/**
 * Diverging bars: extra cost (right, bad) or saving (left) for each price move,
 * without a hedge (grey) and with Keel (accent).
 */
export function ScenarioChart({ plan, scenarios }: { plan: HedgePlan; scenarios: Scenario[] }) {
  const max = Math.max(1, ...scenarios.flatMap((s) => [Math.abs(s.unhedgedImpactUsd), Math.abs(s.netImpactUsd)]));
  const sellers = plan.input.direction === "sell";
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ background: "var(--chart-unhedged)" }} /> Without hedge
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-accent" /> With Keel (after costs)
        </span>
        <span className="ml-auto">{sellers ? "← more revenue · less revenue →" : "← saves you money · costs you more →"}</span>
      </div>
      <div className="space-y-1.5">
        {scenarios.map((s) => (
          <div key={s.shock} className="grid grid-cols-[3.25rem_1fr_6.5rem] items-center gap-2 text-xs">
            <span className={`num text-right ${s.shock === 0 ? "text-muted" : ""}`}>
              {s.shock > 0 ? "+" : s.shock < 0 ? "−" : ""}
              {Math.abs(s.shock * 100).toFixed(0)}%
            </span>
            <div className="relative h-7">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
              <Bar value={s.unhedgedImpactUsd} max={max} top color="var(--chart-unhedged)" />
              <Bar value={s.netImpactUsd} max={max} color="var(--accent)" />
            </div>
            <span className="num text-right">
              <span className="block text-muted">{usd(s.unhedgedImpactUsd, { sign: true, compact: true })}</span>
              <span className="block font-medium">
                {usd(s.netImpactUsd, { sign: true, compact: true })}
                {s.breachesLiquidation && <span title="Past the liquidation price: the guardian adds margin before this"> ⚠</span>}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Price move in {plan.instrument.label}, applied to the whole remaining exposure.</p>
    </div>
  );
}

function Bar({ value, max, color, top }: { value: number; max: number; color: string; top?: boolean }) {
  const w = (Math.abs(value) / max) * 50;
  const style: React.CSSProperties = {
    background: color,
    width: `${w}%`,
    height: "44%",
    top: top ? "4%" : "52%",
    ...(value >= 0 ? { left: "50%" } : { right: "50%" }),
  };
  return <div className="absolute rounded-sm" style={style} />;
}
