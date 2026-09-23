import { distanceToLiquidation } from "./margin";
import { nextStep, openSize, realizedPnl, type HedgeRecord } from "./records";
import type { AccountState } from "./venue";

export interface HedgeReportRow {
  id: string;
  label: string;
  exposure: string;
  coin: string;
  side: "long" | "short";
  status: HedgeRecord["status"];
  openSize: number;
  entryPx: number;
  markPx: number | null;
  /** Benchmark price component locked per user unit (e.g. crude cost per litre). */
  lockedPerUnit: number | null;
  marketPerUnit: number | null;
  unitLabel: string;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  /** Funding attributed to this hedge (share of the market's position). */
  fundingUsd: number;
  /** What the hedge has paid out (or cost) so far, net of funding. */
  protectionUsd: number;
  liqDistance: number | null;
  nextSettlement: number | null;
  settledPeriods: number;
  totalPeriods: number;
}

export function buildReport(hedges: HedgeRecord[], account: AccountState | null): HedgeReportRow[] {
  const byCoinOpen = new Map<string, number>();
  for (const h of hedges) byCoinOpen.set(h.coin, (byCoinOpen.get(h.coin) ?? 0) + openSize(h));

  return hedges.map((h) => {
    const pos = account?.positions.find((p) => p.coin === h.coin);
    const size = openSize(h);
    const mark = pos?.markPx ?? null;
    const unrealized = mark !== null ? h.side * size * (mark - h.entryPx) : 0;
    const coinOpen = byCoinOpen.get(h.coin) ?? 0;
    const funding = pos && coinOpen > 0 ? pos.fundingSinceOpenUsd * (size / coinOpen) : 0;
    const realized = realizedPnl(h);
    const next = nextStep(h);
    return {
      id: h.id,
      label: h.label,
      exposure: h.exposureLabel,
      coin: h.coin,
      side: h.side === 1 ? "long" : "short",
      status: h.status,
      openSize: size,
      entryPx: h.entryPx,
      markPx: mark,
      lockedPerUnit: h.lockedPerUserUnit,
      marketPerUnit: mark !== null && !h.inverseQuote ? mark * h.toInstrument : null,
      unitLabel: h.unitLabel,
      unrealizedPnlUsd: unrealized,
      realizedPnlUsd: realized,
      fundingUsd: funding,
      protectionUsd: unrealized + realized - funding,
      liqDistance: pos ? distanceToLiquidation(pos.side, pos.markPx, pos.liqPx) : null,
      nextSettlement: next?.date ?? null,
      settledPeriods: h.settled.length,
      totalPeriods: h.schedule.length,
    };
  });
}

const CSV_COLUMNS: (keyof HedgeReportRow)[] = [
  "label",
  "exposure",
  "coin",
  "side",
  "status",
  "openSize",
  "entryPx",
  "markPx",
  "lockedPerUnit",
  "marketPerUnit",
  "unitLabel",
  "unrealizedPnlUsd",
  "realizedPnlUsd",
  "fundingUsd",
  "protectionUsd",
  "settledPeriods",
  "totalPeriods",
  "nextSettlement",
];

/** Accountant-friendly CSV of all hedges. */
export function reportToCsv(rows: HedgeReportRow[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(6)) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      CSV_COLUMNS.map((c) => (c === "nextSettlement" && r[c] ? new Date(r[c] as number).toISOString().slice(0, 10) : esc(r[c]))).join(","),
    );
  }
  return lines.join("\n");
}
