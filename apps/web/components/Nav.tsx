"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useKeel } from "@/lib/keel";
import { shortAddr } from "@/lib/format";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/hedge", label: "New hedge" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Nav() {
  const path = usePathname();
  const { mode, setMode, network, setNetwork, wallet, connect, disconnect, walletError, pendingActions } = useKeel();
  const alerts = pendingActions.filter((a) => a.kind !== "alert" || a.level !== "info").length;

  return (
    <header className="z-20 border-b border-line bg-bg/90 backdrop-blur sm:sticky sm:top-0">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span className="text-lg">Keel</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 font-medium ${path === l.href ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {l.label}
              {l.href === "/dashboard" && alerts > 0 && (
                <span className="ml-1.5 rounded-full bg-warn-soft px-1.5 text-xs text-warn">{alerts}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Trading mode">
            <button aria-pressed={mode === "paper"} onClick={() => setMode("paper")} title="Simulated fills at live prices">
              Paper
            </button>
            <button aria-pressed={mode === "live"} onClick={() => setMode("live")} title="Real orders on Hyperliquid">
              Live
            </button>
          </div>
          {mode === "live" && (
            <select
              className="field !w-auto !py-1.5 text-sm"
              value={network}
              onChange={(e) => setNetwork(e.target.value as "mainnet" | "testnet")}
              aria-label="Network"
            >
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          )}
          {wallet ? (
            <button className="btn btn-ghost !py-1.5 text-sm" onClick={disconnect} title="Disconnect">
              <span className="h-2 w-2 rounded-full bg-good" />
              <span className="num">{shortAddr(wallet.address)}</span>
            </button>
          ) : (
            <button className="btn btn-primary !py-1.5 text-sm" onClick={connect}>
              Connect wallet
            </button>
          )}
        </div>
        {walletError && <p className="w-full text-sm text-bad">{walletError}</p>}
      </div>
    </header>
  );
}
