"use client";

import { runScenarios, type HedgePlan } from "@keel/hedge-sdk";
import { useMemo, useState } from "react";
import { date, fundingApr, pct, price, qty, ticker, usd } from "@/lib/format";
import { ScenarioChart } from "./ScenarioChart";

export function PlanPanel({ plan, localPrice }: { plan: HedgePlan; localPrice?: number }) {
  const scenarios = useMemo(() => runScenarios(plan), [plan]);
  const [showSchedule, setShowSchedule] = useState(false);
  const fx = plan.exposure.category === "fx";
  const unitShort = plan.unit.id;
  const sideWord = plan.side === 1 ? "Long" : "Short";

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="label">You lock in</div>
        {plan.lockedPerUserUnit !== null && !fx ? (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="num text-4xl font-medium">${plan.lockedPerUserUnit < 1 ? plan.lockedPerUserUnit.toFixed(4) : price(plan.lockedPerUserUnit)}</span>
            <span className="text-ink-2">
              per {plan.unit.label.replace(/s$/, "")} {plan.exposure.basisNote ? "(benchmark component)" : ""}
            </span>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="num text-4xl font-medium">{price(plan.lockedRate)}</span>
            <span className="text-ink-2">{plan.instrument.label}</span>
          </div>
        )}
        {localPrice && plan.lockedPerUserUnit !== null ? (
          <p className="mt-2 text-sm text-ink-2">
            You pay about <span className="num">${localPrice.toFixed(3)}</span> per {unitShort} today. The benchmark part (
            <span className="num">{pct(plan.lockedPerUserUnit / localPrice, 0)}</span> of it) is what moves with global prices, and
            that part is now fixed for {pct(plan.input.hedgeRatio, 0)} of your volume.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-2">
            {pct(plan.input.hedgeRatio, 0)} of {usd(plan.exposureUsd, { compact: true })} exposure over {Math.round(plan.horizonDays)} days.
          </p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Item k="Position" v={`${sideWord} ${qty(plan.size, 4)} ${plan.instrument.unit}`} sub={ticker(plan.market.coin)} />
          <Item k="Hedge value" v={usd(plan.notionalUsd)} />
          <Item k="Margin needed" v={usd(plan.marginUsd)} sub={`${plan.leverage}x isolated`} />
          <Item
            k="Liquidation"
            v={price(plan.liqPx)}
            sub={`${pct(plan.liqDistance, 0)} ${plan.side === 1 ? "drop" : "rise"} away`}
            tone={plan.liqDistance < 0.25 ? "bad" : undefined}
          />
          <Item
            k="All-in cost"
            v={usd(plan.costs.totalUsd)}
            sub={`${pct(plan.costs.totalPctOfHedged, 2)} of hedge`}
            tone={plan.costs.totalUsd < 0 ? "good" : undefined}
          />
          <Item
            k="Carry"
            v={pct(fundingApr(plan.costs.fundingHourly) * plan.side, 1, true)}
            sub="per year · + means you pay"
          />
        </dl>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">Cost breakdown</summary>
          <div className="mt-2 grid grid-cols-2 gap-1 text-ink-2">
            <span>Exchange fees (est.)</span>
            <span className="num text-right">{usd(plan.costs.tradingFeesUsd, { cents: true })}</span>
            <span>Keel fee</span>
            <span className="num text-right">{usd(plan.costs.builderFeesUsd, { cents: true })}</span>
            <span>Funding over the schedule</span>
            <span className="num text-right">{usd(plan.costs.fundingUsd, { cents: true })}</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            Funding uses the median hourly rate of the last 14 days. Negative means your hedge is paid to hold.
          </p>
        </details>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Stress test</h3>
        </div>
        <ScenarioChart plan={plan} scenarios={scenarios} />
      </div>

      <div className="card p-5">
        <button className="flex w-full items-center justify-between" onClick={() => setShowSchedule((v) => !v)}>
          <h3 className="font-semibold">Unwind schedule</h3>
          <span className="text-sm text-muted">
            {plan.schedule.length} step{plan.schedule.length > 1 ? "s" : ""} · {showSchedule ? "hide" : "show"}
          </span>
        </button>
        <p className="mt-1 text-sm text-ink-2">
          On each date you make your purchase and Keel closes the matching slice of the hedge, so the hedge always matches what
          you still have to buy.
        </p>
        {showSchedule && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 text-right font-medium">You {plan.input.direction === "buy" ? "buy" : "sell"}</th>
                <th className="py-1 text-right font-medium">Keel closes</th>
                <th className="py-1 text-right font-medium">Still hedged</th>
              </tr>
            </thead>
            <tbody className="num">
              {plan.schedule.map((s) => (
                <tr key={s.index} className="border-t border-line">
                  <td className="py-1.5 font-sans">{date(s.date)}</td>
                  <td className="py-1.5 text-right">
                    {qty(s.userQty)} {unitShort}
                  </td>
                  <td className="py-1.5 text-right">{qty(s.reduceSize, 4)}</td>
                  <td className="py-1.5 text-right">{qty(s.remainingAfter, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {plan.warnings.length > 0 && (
        <ul className="space-y-2">
          {plan.warnings.map((w) => (
            <li
              key={w.code}
              className={`rounded-xl px-4 py-3 text-sm ${
                w.level === "blocker" ? "bg-bad-soft text-bad" : w.level === "caution" ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2"
              }`}
            >
              {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Item({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className={`num ${tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : ""}`}>{v}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}
