"use client";

import { EXPOSURES, type MarketSnapshot } from "@keel/hedge-sdk";
import Link from "next/link";
import { useCandles } from "@/lib/hooks";
import { fundingApr, pct, price, ticker, usd } from "@/lib/format";
import { useKeel } from "@/lib/keel";
import { Sparkline } from "./Sparkline";

/** One row per benchmark, labelled with the everyday costs it hedges. */
const ROWS: { coin: string; name: string; unit: string }[] = [
  { coin: "xyz:BRENTOIL", name: "Brent crude", unit: "per barrel" },
  { coin: "xyz:CL", name: "WTI crude", unit: "per barrel" },
  { coin: "xyz:NATGAS", name: "Natural gas", unit: "per MMBtu" },
  { coin: "xyz:GOLD", name: "Gold", unit: "per troy oz" },
  { coin: "xyz:SILVER", name: "Silver", unit: "per troy oz" },
  { coin: "xyz:COPPER", name: "Copper", unit: "per lb" },
  { coin: "xyz:PLATINUM", name: "Platinum", unit: "per troy oz" },
  { coin: "xyz:EUR", name: "Euro", unit: "USD per EUR" },
  { coin: "xyz:GBP", name: "Pound sterling", unit: "USD per GBP" },
  { coin: "xyz:JPY", name: "Japanese yen", unit: "JPY per USD" },
];

function coversFor(coin: string) {
  return EXPOSURES.filter((e) => e.instruments.some((i) => i.coin === coin));
}

export function MarketBoard() {
  const { markets, marketsError, mode, network } = useKeel();
  const dataNetwork = mode === "paper" ? "mainnet" : network;

  if (marketsError && !markets) {
    return <div className="card p-6 text-bad">Could not load Hyperliquid markets: {marketsError}</div>;
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left whitespace-nowrap text-muted">
              <th className="px-4 py-3 font-medium">Benchmark</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">24h</th>
              <th className="px-4 py-3 font-medium">30 days</th>
              <th className="px-4 py-3 text-right font-medium" title="Typical funding, annualised. Positive = long hedges pay.">
                Carry / yr
              </th>
              <th className="px-4 py-3 text-right font-medium">24h volume</th>
              <th className="px-4 py-3 font-medium">Hedges</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <Row key={r.coin} row={r} m={markets?.get(r.coin)} network={dataNetwork} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row, m, network }: { row: (typeof ROWS)[number]; m?: MarketSnapshot; network: "mainnet" | "testnet" }) {
  const candles = useCandles(m ? row.coin : undefined, network, 30);
  const covers = coversFor(row.coin);
  const change = m && m.prevDayPx > 0 ? m.markPx / m.prevDayPx - 1 : NaN;
  const carry = m ? fundingApr(m.fundingHourlyTypical ?? m.fundingHourly) : NaN;
  return (
    <tr className="border-b border-line last:border-0 hover:bg-surface-2/40">
      <td className="px-4 py-3">
        <div className="font-semibold">{row.name}</div>
        <div className="text-xs text-muted">
          {ticker(row.coin)} · {row.unit}
        </div>
      </td>
      <td className="num px-4 py-3 text-right">{m ? price(m.markPx) : "…"}</td>
      <td className={`num px-4 py-3 text-right ${change >= 0 ? "text-good" : "text-bad"}`}>{m ? pct(change, 2, true) : ""}</td>
      <td className="px-4 py-2">
        <Sparkline candles={candles} />
      </td>
      <td className="num px-4 py-3 text-right text-ink-2">{m ? pct(carry, 1, true) : ""}</td>
      <td className="num px-4 py-3 text-right text-ink-2">{m ? usd(m.dayVolumeUsd, { compact: true }) : ""}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {covers.slice(0, 3).map((e) => (
            <Link
              key={e.id}
              href={`/hedge?e=${e.id}${e.instruments[0]?.coin === row.coin ? "" : `&i=${encodeURIComponent(row.coin)}`}`}
              className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-medium hover:border-accent hover:text-accent"
            >
              {e.label}
            </Link>
          ))}
        </div>
      </td>
    </tr>
  );
}
