"use client";

import { applySettlement, errorMessage, openSize, type HedgeRecord, type HedgeReportRow } from "@keel/hedge-sdk";
import { useState } from "react";
import { date, price, qty, ticker, time, usd } from "@/lib/format";
import { useKeel } from "@/lib/keel";
import { HealthBar } from "./HealthBar";

export function HedgeCard({ record, row }: { record: HedgeRecord; row: HedgeReportRow }) {
  const { venue, setHedges, refresh, now } = useKeel();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const closed = record.status === "closed";
  const perUnit = record.lockedPerUserUnit !== null && row.marketPerUnit !== null;
  const unit = record.unitLabel.replace(/s$/, "");
  const buyer = record.input.direction === "buy";
  const good = row.protectionUsd >= 0;

  async function closeAll() {
    if (!venue) return;
    setBusy(true);
    setErr(null);
    try {
      const size = openSize(record);
      const res = await venue.reduce(record.coin, record.side, size);
      if (res.status !== "filled") throw new Error(res.message ?? "Close order did not fill");
      const done = new Set(record.settled.map((s) => s.index));
      const remaining = record.schedule.filter((s) => !done.has(s.index));
      setHedges((book) =>
        book.map((h) =>
          h.id === record.id ? { ...applySettlement(h, remaining, res, now()), status: "closed" as const } : h,
        ),
      );
      await refresh();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`card p-5 ${closed ? "opacity-70" : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{record.label}</h3>
          <p className="text-sm text-muted">
            {buyer ? "Buying" : "Selling"} {qty(record.input.quantity)} {record.unitLabel}
            {record.input.frequency !== "once" ? ` ${record.input.frequency}` : ""} · {record.side === 1 ? "long" : "short"}{" "}
            {qty(row.openSize, 4)} {ticker(record.coin)}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            record.status === "open" ? "bg-good-soft text-good" : record.status === "pending" ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted"
          }`}
        >
          {record.status === "pending" ? "waiting for fill" : record.status}
        </span>
      </header>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted">{perUnit ? `Locked per ${unit}` : "Locked rate"}</div>
          <div className="num text-xl">
            {perUnit ? `$${record.lockedPerUserUnit! < 1 ? record.lockedPerUserUnit!.toFixed(4) : price(record.lockedPerUserUnit!)}` : price(record.entryPx)}
          </div>
          <div className="num text-xs text-muted">
            market now{" "}
            {perUnit
              ? `$${row.marketPerUnit! < 1 ? row.marketPerUnit!.toFixed(4) : price(row.marketPerUnit!)}`
              : row.markPx !== null
                ? price(row.markPx)
                : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Hedge result to date</div>
          <div className={`num text-xl ${good ? "text-good" : "text-bad"}`}>{usd(row.protectionUsd, { sign: true, cents: true })}</div>
          <div className="text-xs text-muted">
            {Math.abs(row.protectionUsd) < 0.5
              ? "Prices flat so far"
              : good
                ? buyer
                  ? "Offsets higher purchase costs"
                  : "Offsets lower sale prices"
                : buyer
                  ? "Your purchases got cheaper by about this much"
                  : "You sold at better prices by about this much"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Schedule</div>
          <div className="num text-xl">
            {row.settledPeriods}/{row.totalPeriods}
          </div>
          <div className="text-xs text-muted">{row.nextSettlement ? `next ${date(row.nextSettlement)}` : closed ? "complete" : "final step due"}</div>
        </div>
      </div>

      {!closed && (
        <div className="mt-4">
          <HealthBar distance={row.liqDistance} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <button className="text-muted underline-offset-2 hover:underline" onClick={() => setShowLog((v) => !v)}>
          {showLog ? "Hide" : "Show"} activity ({record.events.length})
        </button>
        <span className="text-muted">
          · realised {usd(row.realizedPnlUsd, { sign: true, cents: true })} · funding {usd(-row.fundingUsd, { sign: true, cents: true })}
        </span>
        {record.status === "open" && (
          <button className="btn btn-ghost ml-auto !py-1 text-xs" disabled={busy} onClick={closeAll}>
            {busy ? "Closing…" : "Close hedge"}
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      {showLog && (
        <ol className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          {[...record.events].reverse().map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="num shrink-0 text-xs text-muted">
                {date(e.at)} {time(e.at)}
              </span>
              <span className="text-ink-2">{e.message}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
