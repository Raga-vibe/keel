"use client";

import { planHedge, runScenarios } from "@keel/hedge-sdk";
import Link from "next/link";
import { useMemo } from "react";
import { MarketBoard } from "@/components/MarketBoard";
import { price, usd } from "@/lib/format";
import { useKeel } from "@/lib/keel";

const DAY = 24 * 60 * 60 * 1000;

const OTHER_EXPOSURES = [
  {
    title: "Fuel and energy",
    example: "Fuel buyers can offset some movement in crude benchmarks.",
    limit: "Pump and delivered prices also include refining, taxes, and transport.",
    exposureId: "diesel",
  },
  {
    title: "Metals",
    example: "Jewellers and manufacturers can plan around gold, silver, or copper prices.",
    limit: "Local supplier prices and premiums may differ from the global benchmark.",
    exposureId: "gold",
  },
];

export default function Home() {
  return (
    <>
      <Hero />
      <InvoiceExample />

      <section id="how-it-works" className="mt-20 scroll-mt-24">
        <SectionHeading
          eyebrow="A business cost, translated into a plan"
          title="How Keel works"
          description="Start with the bill you expect to pay. Keel turns its price risk into a position you can review and manage."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StepCard
            number="1"
            title="Enter the future cost"
            description="Choose what you buy or pay for, enter the amount, and add the payment or purchase dates."
          />
          <StepCard
            number="2"
            title="Review the hedge plan"
            description="See the position Keel proposes, the USDC margin it needs, estimated fees and funding, and price-move scenarios."
          />
          <StepCard
            number="3"
            title="Monitor and unwind"
            description="When running, Keel watches margin and can close planned slices as bills come due. The browser guardian runs while the app is open; 24/7 use needs the separate keeper."
          />
        </div>
      </section>

      <section className="mt-20">
        <SectionHeading
          eyebrow="The trade-off"
          title="A hedge can soften both sides of a price move"
          description="For an importer with a euro bill, Keel models a euro position alongside the invoice exposure."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <MoveCard
            title="If the euro rises"
            bill="The invoice costs more dollars."
            hedge="The euro position may gain value and offset part of the increase."
          />
          <MoveCard
            title="If the euro falls"
            bill="The invoice costs fewer dollars."
            hedge="The euro position may lose value, reducing some of that saving."
          />
        </div>
        <p className="mt-3 text-sm text-muted">
          The aim is a more predictable business cost. The position can lose money, and it does not guarantee the invoice rate.
        </p>
      </section>

      <section className="mt-20">
        <SectionHeading
          eyebrow="Clear limits, up front"
          title="What the plan covers—and what it leaves with you"
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <LimitCard
            title="Collateral is required"
            description="Margin stays in your Hyperliquid account. A sharp price move can use that margin or liquidate the position."
          />
          <LimitCard
            title="A benchmark is a proxy"
            description="EUR/USD tracks currency movement. Fuel and metals use global benchmarks that may differ from your supplier’s price."
          />
          <LimitCard
            title="Costs can change"
            description="Trading fees are estimated and funding rates move over time. The plan uses recent data, not a guaranteed future cost."
          />
        </div>
      </section>

      <section className="mt-20">
        <SectionHeading
          eyebrow="One planner, more business costs"
          title="Start with invoices; extend to the inputs you buy"
          description="Keel currently supports currency invoices, energy, and metals. Each plan names the benchmark it uses and its limits."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {OTHER_EXPOSURES.map((item) => (
            <Link
              key={item.exposureId}
              href={`/hedge?e=${item.exposureId}`}
              className="card group p-5 transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-semibold">{item.title}</h3>
                <span className="text-sm font-semibold text-accent group-hover:underline">Explore →</span>
              </div>
              <p className="mt-3 text-sm text-ink-2">{item.example}</p>
              <p className="mt-2 text-sm text-muted">Limit: {item.limit}</p>
            </Link>
          ))}
        </div>
        <div className="card mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Why Hyperliquid?</h3>
            <p className="mt-1 max-w-3xl text-sm text-ink-2">
              Its perpetual markets trade around the clock and have no expiry to roll. Keel sends orders to your Hyperliquid account;
              Keel does not hold your funds. Paper mode simulates trades. The live order flow was verified on testnet and has not been
              used with real funds.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent">
            Live prices · paper trades
          </span>
        </div>
      </section>

      <section className="mt-20" id="benchmarks">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label">For a closer look</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold">Available Hyperliquid benchmarks</h2>
            <p className="mt-1 text-sm text-muted">
              Data refreshes every 15 seconds. Paper mode uses mainnet prices; live mode follows the selected network.
            </p>
          </div>
          <Link href="/hedge?e=eur" className="btn btn-ghost">
            Plan a future bill →
          </Link>
        </div>
        <MarketBoard />
      </section>
    </>
  );
}

function Hero() {
  return (
    <section className="grid items-center gap-10 pt-12 md:grid-cols-[1.1fr_0.9fr] md:pt-20">
      <div>
        <p className="label !text-accent">A price-risk tool for businesses</p>
        <h1 className="mt-3 max-w-2xl font-serif text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl">
          Make your next supplier bill more predictable.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-2">
          If you owe euros later, a stronger euro can make the bill cost more dollars. Keel models an offsetting position and shows
          its margin, costs, and risks before you act.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/hedge?e=eur" className="btn btn-primary">
            Explore a €250,000 invoice
          </Link>
          <a href="#how-it-works" className="btn btn-ghost">
            How it works
          </a>
        </div>
        <p className="mt-4 max-w-xl text-sm text-muted">
          Paper mode uses live market prices but simulated trades. No real order is placed in paper mode.
        </p>
      </div>
      <div className="card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="label">Example situation · importer</p>
            <h2 className="mt-1 text-lg font-semibold">€250,000 due in 90 days</h2>
          </div>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">75% modeled hedge</span>
        </div>
        <p className="mt-2 text-sm text-ink-2">A euro rise can increase the dollar cost of this invoice.</p>
        <div className="mt-5 rounded-xl bg-surface-2 p-4">
          <div className="text-sm font-medium">What Keel estimates</div>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li className="flex gap-2"><span aria-hidden="true">•</span><span>A euro position sized against the invoice</span></li>
            <li className="flex gap-2"><span aria-hidden="true">•</span><span>USDC collateral needed to hold it</span></li>
            <li className="flex gap-2"><span aria-hidden="true">•</span><span>How a 10% currency move could affect the bill and hedge</span></li>
          </ul>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          This is a financial offset, not a fixed supplier rate. It can lose value and may not match your exact invoice costs.
        </p>
      </div>
    </section>
  );
}

function InvoiceExample() {
  const { markets, marketsError, config, mode, network } = useKeel();
  const example = useMemo(() => {
    const now = Date.now();
    if (!markets?.get("xyz:EUR")) return null;
    try {
      const plan = planHedge(
        {
          exposureId: "eur",
          unitId: "EUR",
          quantity: 250_000,
          frequency: "once",
          periods: 1,
          direction: "buy",
          hedgeRatio: 0.75,
          firstSettlement: now + 90 * DAY,
        },
        markets,
        { config, now },
      );
      return { plan, scenario: runScenarios(plan, [0.1])[0]! };
    } catch {
      return null;
    }
  }, [markets, config]);

  return (
    <section className="mt-8" aria-live="polite" aria-busy={!example && !marketsError && !markets}>
      <div className="card border-accent/30 bg-accent-soft/30 p-5 sm:p-6">
        {example ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="label !text-accent">
                  A modeled scenario, using {mode === "live" && network === "testnet" ? "testnet" : "mainnet"} data
                </p>
                <h2 className="mt-1 font-serif text-2xl font-semibold">If EUR/USD rises 10%</h2>
                <p className="mt-1 text-sm text-ink-2">
                  Invoice: €250,000 in 90 days · Keel models a 75% offset before costs and liquidation risk.
                </p>
              </div>
              <Link href="/hedge?e=eur" className="btn btn-primary">
                See the full plan →
              </Link>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Current EUR/USD" value={`$${price(example.plan.refPx)} / €1`} />
              <Stat label="USDC margin estimate" value={usd(example.plan.marginUsd)} />
              <Stat label="Invoice impact without hedge" value={usd(example.scenario.unhedgedImpactUsd, { sign: true })} />
              <Stat label="Modeled impact after hedge + costs" value={usd(example.scenario.netImpactUsd, { sign: true })} />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Illustrative scenario, not a quote. Margin, funding, and fees are estimates; funding can change, and the position could
              be liquidated before the invoice is due.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="label !text-accent">A concrete example</p>
              <h2 className="mt-1 font-serif text-xl font-semibold">€250,000 due in 90 days</h2>
              <p className="mt-1 text-sm text-ink-2">
                Keel will show a live EUR/USD scenario when market data is available.
              </p>
            </div>
            <span className="text-sm text-muted">
              {marketsError || markets ? "Live example temporarily unavailable" : "Loading live EUR/USD data…"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="label !text-accent">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-2 text-ink-2">{description}</p>}
    </div>
  );
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <article className="card p-5">
      <div className="num mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-sm text-accent">{number}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">{description}</p>
    </article>
  );
}

function MoveCard({ title, bill, hedge }: { title: string; bill: string; hedge: string }) {
  return (
    <article className="card p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-3 text-sm text-ink-2"><span className="font-medium text-ink">Invoice:</span> {bill}</p>
      <p className="mt-1 text-sm text-ink-2"><span className="font-medium text-ink">Hedge:</span> {hedge}</p>
    </article>
  );
}

function LimitCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="card p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{description}</p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <div className="text-xs leading-relaxed text-muted">{label}</div>
      <div className="num mt-1 text-lg font-medium">{value}</div>
    </div>
  );
}
