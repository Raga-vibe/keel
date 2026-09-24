"use client";

import {
  approveKeelAgent,
  approveKeelBuilderFee,
  builderFeePercentString,
  enableUnifiedAccount,
  errorMessage,
  type ExecutionMode,
  type HedgePlan,
} from "@keel/hedge-sdk";
import Link from "next/link";
import { useState } from "react";
import { qty, usd } from "@/lib/format";
import { useKeel } from "@/lib/keel";
import { createAgent } from "@/lib/wallet";

export function ExecutePanel({ plan }: { plan: HedgePlan }) {
  const keel = useKeel();
  const { mode, network, wallet, onboarding, account, config } = keel;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const thinBook = plan.market.dayVolumeUsd < 50_000;
  const [execMode, setExecMode] = useState<ExecutionMode>(thinBook ? "limit" : "market");

  const blocked = plan.warnings.some((w) => w.level === "blocker");
  const needFunds = account ? account.availableUsd < plan.marginUsd * 1.02 : false;

  async function step(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await keel.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function lock() {
    await step("lock", async () => {
      const { result, record } = await keel.openHedge(plan, execMode);
      if (result.status === "error") throw new Error(result.message ?? "Order rejected");
      setDone(
        result.status === "filled"
          ? `Locked. ${plan.side === 1 ? "Long" : "Short"} ${qty(result.filledSize, 4)} at ${result.avgPx.toFixed(4)}.`
          : `Order placed at the oracle price and waiting for a fill (order ${result.oid}). The dashboard updates when it fills.`,
      );
      return record;
    });
  }

  if (done) {
    return (
      <div className="card border-good p-5">
        <div className="font-semibold text-good">{done}</div>
        <p className="mt-1 text-sm text-ink-2">The guardian now watches margin and releases each slice on schedule.</p>
        <Link href="/dashboard" className="btn btn-primary mt-4">
          Go to dashboard →
        </Link>
      </div>
    );
  }

  const title = mode === "paper" ? "Lock this price (paper)" : `Lock on ${network}`;

  // ---- paper -------------------------------------------------------------------
  if (mode === "paper") {
    return (
      <div className="card p-5">
        <h3 className="font-semibold">Ready to lock</h3>
        <p className="mt-1 text-sm text-ink-2">
          Paper mode fills at live Hyperliquid prices with estimated fees and funding. Balance{" "}
          <span className="num">{account ? usd(account.availableUsd) : "…"}</span>.
        </p>
        {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary mt-4 w-full" disabled={blocked || busy !== null || needFunds} onClick={lock}>
          {busy ? "Locking…" : title}
        </button>
        {needFunds && <p className="mt-2 text-sm text-bad">Not enough paper balance for the margin. Reset it from the dashboard.</p>}
      </div>
    );
  }

  // ---- live --------------------------------------------------------------------
  const ob = onboarding;
  const hasBuilder = Boolean(config.builderAddress);
  const steps = [
    {
      id: "wallet",
      done: Boolean(wallet),
      title: "Connect your wallet",
      body: "MetaMask, Rabby or any browser wallet with a Hyperliquid account.",
      action: <button className="btn btn-primary !py-1.5 text-sm" onClick={keel.connect}>Connect</button>,
    },
    {
      id: "routing",
      done: Boolean(ob?.collateralRouting),
      title: "Use one USDC balance for all markets",
      body: "Switches your account to Hyperliquid's unified mode so the commodity markets draw margin from your USDC balance.",
      action: (
        <button
          className="btn btn-ghost !py-1.5 text-sm"
          disabled={busy !== null}
          onClick={() => step("routing", async () => enableUnifiedAccount(keel.userExchange()!, wallet!.address))}
        >
          {busy === "routing" ? "Signing…" : "Enable"}
        </button>
      ),
    },
    {
      id: "agent",
      done: Boolean(ob?.agentApproved && keel.agent),
      title: "Approve the Keel agent",
      body: "A trading key kept in this browser. It can open, close and add margin to hedges. It can never withdraw or transfer your funds.",
      action: (
        <button
          className="btn btn-ghost !py-1.5 text-sm"
          disabled={busy !== null}
          onClick={() =>
            step("agent", async () => {
              const agent = createAgent(network, wallet!.address);
              await approveKeelAgent(keel.userExchange()!, agent.address);
              keel.setAgent(agent);
            })
          }
        >
          {busy === "agent" ? "Signing…" : "Approve"}
        </button>
      ),
    },
    ...(hasBuilder
      ? [
          {
            id: "builder",
            done: Boolean(ob?.builderApproved),
            title: `Approve Keel's ${builderFeePercentString(config.builderFeeTenthsBp)} fee`,
            body: "Charged by Hyperliquid on each hedge trade and paid to Keel. You can revoke it any time.",
            action: (
              <button
                className="btn btn-ghost !py-1.5 text-sm"
                disabled={busy !== null}
                onClick={() => step("builder", async () => approveKeelBuilderFee(keel.userExchange()!, config))}
              >
                {busy === "builder" ? "Signing…" : "Approve"}
              </button>
            ),
          },
        ]
      : []),
    {
      id: "funds",
      done: Boolean(account && !needFunds),
      title: `Have ${usd(plan.marginUsd * 1.02)} USDC available`,
      body: `Available now: ${account ? usd(account.availableUsd) : "—"}. Deposit USDC to Hyperliquid${network === "testnet" ? " (testnet faucet on app.hyperliquid-testnet.xyz)" : ""}.`,
      action: (
        <a
          className="btn btn-ghost !py-1.5 text-sm"
          href={network === "testnet" ? "https://app.hyperliquid-testnet.xyz/drip" : "https://app.hyperliquid.xyz/portfolio"}
          target="_blank"
          rel="noreferrer"
        >
          Deposit ↗
        </a>
      ),
    },
  ];
  const firstOpen = steps.findIndex((s) => !s.done);
  const ready = firstOpen === -1;

  return (
    <div className="card p-5">
      <h3 className="font-semibold">Lock it live</h3>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.id} className="flex gap-3">
            <span
              className={`num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                s.done ? "bg-good-soft text-good" : i === firstOpen ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${s.done ? "text-muted" : ""}`}>{s.title}</div>
              {!s.done && i === firstOpen && (
                <>
                  <p className="mt-0.5 text-sm text-ink-2">{s.body}</p>
                  <div className="mt-2">{s.action}</div>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-ink-2">Execution</span>
          <div className="seg">
            <button aria-pressed={execMode === "market"} onClick={() => setExecMode("market")}>
              Now
            </button>
            <button aria-pressed={execMode === "limit"} onClick={() => setExecMode("limit")}>
              At oracle price
            </button>
          </div>
        </div>
        {thinBook && (
          <p className="mt-2 text-xs text-warn">
            This market has little {network} liquidity right now, so Keel will rest a limit order at the oracle price.
          </p>
        )}
        <label className="mt-4 flex gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          <span>
            I understand this opens a {plan.side === 1 ? "long" : "short"} position of {plan.sizeStr} {plan.market.coin} on
            Hyperliquid {network}, using {usd(plan.marginUsd)} of my USDC as margin.
          </span>
        </label>
        {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary mt-4 w-full" disabled={!ready || !confirmed || blocked || busy !== null} onClick={lock}>
          {busy === "lock" ? "Sending…" : title}
        </button>
      </div>
    </div>
  );
}
