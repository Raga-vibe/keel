"use client";

import { buildReport, reportToCsv } from "@keel/hedge-sdk";
import Link from "next/link";
import { useMemo } from "react";
import { GuardianPanel } from "@/components/dashboard/GuardianPanel";
import { HedgeCard } from "@/components/dashboard/HedgeCard";
import { SimLab } from "@/components/dashboard/SimLab";
import { shortAddr, usd } from "@/lib/format";
import { useKeel } from "@/lib/keel";

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const { hedges, account, mode, network, user, wallet, agent, sim } = useKeel();
  const rows = useMemo(() => buildReport(hedges, account), [hedges, account]);
  const active = hedges.filter((h) => h.status !== "closed");
  const hedgedValue = rows.filter((r) => r.status !== "closed").reduce((s, r) => s + r.openSize * (r.markPx ?? r.entryPx), 0);
  const protection = rows.reduce((s, r) => s + r.protectionUsd, 0);
  const margin = account?.positions.reduce((s, p) => s + p.equityUsd, 0) ?? 0;
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-ink-2">
            {mode === "paper" ? "Paper account" : `Hyperliquid ${network}`} ·{" "}
            <span className="num">{mode === "paper" && !wallet ? "demo" : shortAddr(user)}</span>
            {mode === "paper" && Object.keys(sim.shocks).some((k) => sim.shocks[k]) && (
              <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">simulated prices</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-ghost text-sm"
            disabled={rows.length === 0}
            onClick={() => download(`keel-report-${stamp}.csv`, reportToCsv(rows), "text/csv")}
          >
            Export report (CSV)
          </button>
          {mode === "live" && (
            <button
              className="btn btn-ghost text-sm"
              disabled={hedges.length === 0}
              onClick={() => download("hedges.json", JSON.stringify({ hedges }, null, 2), "application/json")}
            >
              Export for keeper
            </button>
          )}
          <Link href="/hedge" className="btn btn-primary text-sm">
            New hedge
          </Link>
        </div>
      </div>

      {mode === "live" && !wallet && (
        <div className="mt-6 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Connect your wallet to see live hedges.</div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Active hedges" v={String(active.length)} />
        <Kpi k="Value protected" v={usd(hedgedValue, { compact: true })} />
        <Kpi k="Hedge result to date" v={usd(protection, { sign: true })} tone={protection >= 0 ? "good" : "bad"} />
        <Kpi k="Free collateral" v={account ? usd(account.availableUsd, { compact: true }) : "…"} sub={margin ? `${usd(margin, { compact: true })} in margin` : undefined} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {hedges.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="font-semibold">No hedges yet</p>
              <p className="mt-1 text-sm text-ink-2">Plan one in under a minute. Paper mode needs no wallet.</p>
              <Link href="/hedge" className="btn btn-primary mt-4">
                Plan a hedge
              </Link>
            </div>
          ) : (
            hedges.map((h) => <HedgeCard key={h.id} record={h} row={rows.find((r) => r.id === h.id)!} />)
          )}
        </div>
        <div className="space-y-4 lg:sticky lg:top-20">
          <GuardianPanel />
          {mode === "paper" && <SimLab />}
          {mode === "live" && agent && (
            <section className="card p-5 text-sm">
              <h2 className="font-semibold">Keel agent</h2>
              <p className="num mt-1 text-ink-2">{agent.address}</p>
              <p className="mt-2 text-xs text-muted">
                Stored in this browser. It can trade and move margin for your account but cannot withdraw. Revoke it any time
                from Hyperliquid&apos;s API settings.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{k}</div>
      <div className={`num mt-1 text-2xl ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{v}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
