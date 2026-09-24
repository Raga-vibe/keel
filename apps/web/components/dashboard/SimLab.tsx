"use client";

import { useKeel } from "@/lib/keel";
import { date, pct, ticker } from "@/lib/format";

const DAY = 86_400_000;

/** Paper-mode controls for demos: move the clock and stress prices. */
export function SimLab() {
  const { sim, setSim, hedges, now, resetPaper } = useKeel();
  const coins = [...new Set(hedges.filter((h) => h.status !== "closed").map((h) => h.coin))];
  const shocked = Object.values(sim.shocks).some((v) => v !== 0);

  return (
    <section className="card border-dashed p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Simulation lab</h2>
        <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">paper only</span>
        <button className="ml-auto text-sm text-muted hover:text-bad" onClick={() => confirm("Reset the paper account and delete paper hedges?") && resetPaper()}>
          Reset paper account
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-2">Fast-forward time or move prices to see settlements and the guardian at work.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="w-24 text-muted">Clock</span>
        <span className="num">{date(now())}</span>
        {sim.clockOffsetMs > 0 && <span className="text-xs text-warn">(+{Math.round(sim.clockOffsetMs / DAY)} days)</span>}
        <div className="ml-auto flex gap-2">
          <button className="btn btn-ghost !py-1 text-xs" onClick={() => setSim((s) => ({ ...s, clockOffsetMs: s.clockOffsetMs + 7 * DAY }))}>
            +1 week
          </button>
          <button className="btn btn-ghost !py-1 text-xs" onClick={() => setSim((s) => ({ ...s, clockOffsetMs: s.clockOffsetMs + 31 * DAY }))}>
            +1 month
          </button>
          <button className="btn btn-ghost !py-1 text-xs" disabled={!sim.clockOffsetMs} onClick={() => setSim((s) => ({ ...s, clockOffsetMs: 0 }))}>
            Today
          </button>
        </div>
      </div>

      {coins.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Open a paper hedge to stress its price here.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {coins.map((coin) => {
            const v = sim.shocks[coin] ?? 0;
            return (
              <div key={coin} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="w-24 text-muted">{ticker(coin)}</span>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={5}
                  value={v * 100}
                  className="min-w-40 flex-1"
                  aria-label={`${ticker(coin)} price shock`}
                  onChange={(e) => setSim((s) => ({ ...s, shocks: { ...s.shocks, [coin]: Number(e.target.value) / 100 } }))}
                />
                <span className={`num w-14 text-right ${v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-muted"}`}>{pct(v, 0, true)}</span>
              </div>
            );
          })}
          {shocked && (
            <button className="text-sm text-muted underline" onClick={() => setSim((s) => ({ ...s, shocks: {} }))}>
              Back to live prices
            </button>
          )}
        </div>
      )}
    </section>
  );
}
