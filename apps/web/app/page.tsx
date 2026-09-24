"use client";

import { planHedge, runScenarios } from "@keel/hedge-sdk";
import Link from "next/link";
import { useMemo } from "react";
import { MarketBoard } from "@/components/MarketBoard";
import { pct, price, usd } from "@/lib/format";
import { useKeel } from "@/lib/keel";

const PERSONAS = [
  {
    id: "diesel",
    who: "Fleet operator",
    story: "Buys 40,000 L of diesel a month. A 20% oil spike wipes out a quarter's margin.",
    cta: "Lock fuel costs",
  },
  {
    id: "gold",
    who: "Jeweller",
    story: "Quotes fixed prices for custom pieces, then buys gold weeks later at whatever it costs.",
    cta: "Lock metal costs",
  },
  {
    id: "eur",
    who: "Importer",
    story: "Pays a German supplier €250,000 in 90 days. If the euro climbs, the order costs more.",
    cta: "Lock the exchange rate",
  },
];

export default function Home() {
  return (
    <>
      <Hero />
      <section className="mt-16">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-2xl font-semibold">Live benchmarks</h2>
            <p className="text-sm text-muted">Hyperliquid HIP-3 perpetuals, 24/7, updated every 15 seconds.</p>
          </div>
          <Link href="/hedge" className="btn btn-ghost">
            Plan a hedge →
          </Link>
        </div>
        <MarketBoard />
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {[
          ["1", "Describe what you buy", "Fuel, metals or foreign-currency invoices, in your own units, on your own schedule."],
          ["2", "Keel builds the hedge", "Sizes a low-leverage position on the matching benchmark, with costs, stress tests and an unwind plan."],
          ["3", "The guardian runs it", "Adds margin before danger, releases each slice when you make the purchase, and keeps an audit trail."],
        ].map(([n, t, d]) => (
          <div key={n} className="card p-5">
            <div className="num mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-sm text-accent">{n}</div>
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-1 text-sm text-ink-2">{d}</p>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <h2 className="mb-4 font-serif text-2xl font-semibold">Built for businesses, not traders</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PERSONAS.map((p) => (
            <Link key={p.id} href={`/hedge?e=${p.id}`} className="card group p-5 transition-colors hover:border-accent">
              <div className="label">{p.who}</div>
              <p className="mt-2 text-ink-2">{p.story}</p>
              <div className="mt-4 text-sm font-semibold text-accent group-hover:underline">{p.cta} →</div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function Hero() {
  const { markets, config } = useKeel();
  const example = useMemo(() => {
    if (!markets?.get("xyz:BRENTOIL")) return null;
    try {
      const plan = planHedge(
        { exposureId: "diesel", unitId: "L", quantity: 40_000, frequency: "monthly", periods: 6, direction: "buy", hedgeRatio: 0.8 },
        markets,
        { config },
      );
      const spike = runScenarios(plan, [0.2])[0]!;
      return { plan, spike };
    } catch {
      return null;
    }
  }, [markets, config]);

  return (
    <section className="grid items-center gap-10 pt-12 md:grid-cols-[1.1fr_1fr] md:pt-20">
      <div>
        <p className="label !text-accent">Built on Hyperliquid HIP-3 markets</p>
        <h1 className="mt-3 font-serif text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
          Lock in what you pay for fuel, metals and foreign currency.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-2">
          Keel turns Hyperliquid&apos;s 24/7 commodity and FX markets into a price lock for small businesses: no bank
          relationship, no futures account, and your funds never leave your wallet.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/hedge" className="btn btn-primary">
            Plan a hedge
          </Link>
          <Link href="/dashboard" className="btn btn-ghost">
            Open dashboard
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted">Paper mode is on: try everything with simulated funds at live prices.</p>
      </div>

      <div className="card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="label">Example · fleet diesel</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" /> live
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-2">40,000 L a month for 6 months, 80% hedged</p>
        {example ? (
          <>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="num text-4xl font-medium">${example.plan.lockedPerUserUnit!.toFixed(3)}</span>
              <span className="text-muted">per litre crude cost, locked</span>
            </div>
            <div className="mt-5 rounded-xl bg-surface-2 p-4">
              <div className="text-sm font-medium">If oil jumps 20%</div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted">Without Keel</div>
                  <div className="num text-xl text-bad">{usd(example.spike.unhedgedImpactUsd, { sign: true })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">With Keel</div>
                  <div className="num text-xl">{usd(example.spike.netImpactUsd, { sign: true })}</div>
                </div>
              </div>
              <div className="mt-3 border-t border-line-strong/60 pt-3 text-sm text-good">
                Keel absorbs <span className="num">{usd(example.spike.hedgePnlUsd)}</span> of the shock
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <Stat k="Hedge" v={`${example.plan.sizeStr} bbl`} />
              <Stat k="Brent" v={`$${price(example.plan.refPx)}`} />
              <Stat k="All-in cost" v={pct(example.plan.costs.totalPctOfHedged)} />
            </div>
          </>
        ) : (
          <div className="mt-6 h-48 animate-pulse rounded-xl bg-surface-2" />
        )}
      </div>
    </section>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{k}</div>
      <div className="num">{v}</div>
    </div>
  );
}
