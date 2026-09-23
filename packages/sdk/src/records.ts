import type { Side } from "./margin";
import type { NetworkId } from "./network";
import type { ExposureInput, HedgePlan, SettlementStep } from "./types";
import type { ExecutionResult } from "./venue";

export interface SettlementFill {
  index: number;
  at: number;
  size: number;
  px: number;
  /** Realised hedge PnL on this slice (positive = hedge paid out). */
  pnlUsd: number;
}

export interface HedgeEvent {
  at: number;
  kind: "opened" | "settled" | "margin-added" | "reduced" | "alert" | "closed" | "resting";
  message: string;
}

/**
 * Keel's book-keeping for one business hedge. Hyperliquid keeps one net
 * position per market, so several records can share a position; each record
 * tracks its own entry, schedule and realised results.
 */
export interface HedgeRecord {
  id: string;
  label: string;
  createdAt: number;
  venue: "live" | "paper";
  network: NetworkId;
  input: ExposureInput;
  exposureLabel: string;
  unitLabel: string;
  /** Instrument units per user unit, frozen at open. */
  toInstrument: number;
  inverseQuote: boolean;
  coin: string;
  instrumentUnit: string;
  side: Side;
  size: number;
  entryPx: number;
  leverage: number;
  lockedPerUserUnit: number | null;
  schedule: SettlementStep[];
  settled: SettlementFill[];
  status: "open" | "pending" | "closed";
  oid?: number;
  events: HedgeEvent[];
}

function newId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `h_${Date.now().toString(36)}_${rand}`;
}

export function recordFromPlan(
  plan: HedgePlan,
  fill: ExecutionResult,
  venue: "live" | "paper",
  network: NetworkId,
  now = Date.now(),
): HedgeRecord {
  const filled = fill.status === "filled";
  const entryPx = filled ? fill.avgPx : plan.refPx;
  const size = filled ? fill.filledSize : plan.size;
  return {
    id: newId(),
    label: plan.input.label?.trim() || `${plan.exposure.label} hedge`,
    createdAt: now,
    venue,
    network,
    input: plan.input,
    exposureLabel: plan.exposure.label,
    unitLabel: plan.unit.label,
    toInstrument: plan.unit.toInstrument,
    inverseQuote: Boolean(plan.exposure.inverseQuote),
    coin: plan.market.coin,
    instrumentUnit: plan.instrument.unit,
    side: plan.side,
    size,
    entryPx,
    leverage: plan.leverage,
    lockedPerUserUnit: plan.exposure.inverseQuote ? null : entryPx * plan.unit.toInstrument,
    schedule: plan.schedule,
    settled: [],
    status: filled ? "open" : "pending",
    oid: fill.oid,
    events: [
      {
        at: now,
        kind: filled ? "opened" : "resting",
        message: filled
          ? `Opened ${plan.side === 1 ? "long" : "short"} ${size} ${plan.market.coin} at ${entryPx}`
          : `Limit order resting at the oracle price (order ${fill.oid ?? "?"})`,
      },
    ],
  };
}

export function openSize(r: HedgeRecord): number {
  if (r.status === "closed") return 0;
  const done = r.settled.reduce((s, f) => s + f.size, 0);
  return Math.max(0, r.size - done);
}

export function realizedPnl(r: HedgeRecord): number {
  return r.settled.reduce((s, f) => s + f.pnlUsd, 0);
}

/** Settlement steps whose date has passed and that have not been executed yet. */
export function dueSteps(r: HedgeRecord, now = Date.now()): SettlementStep[] {
  if (r.status !== "open") return [];
  const done = new Set(r.settled.map((f) => f.index));
  return r.schedule.filter((s) => s.date <= now && !done.has(s.index));
}

export function nextStep(r: HedgeRecord, now = Date.now()): SettlementStep | undefined {
  const done = new Set(r.settled.map((f) => f.index));
  return r.schedule.find((s) => !done.has(s.index) && s.date > now);
}

/** Record a settlement fill against one or more schedule steps. */
export function applySettlement(
  r: HedgeRecord,
  steps: SettlementStep[],
  fill: ExecutionResult,
  now = Date.now(),
): HedgeRecord {
  if (fill.status !== "filled" || steps.length === 0) return r;
  const planned = steps.reduce((s, x) => s + x.reduceSize, 0);
  const settled = [...r.settled];
  for (const step of steps) {
    const size = planned > 0 ? (fill.filledSize * step.reduceSize) / planned : 0;
    settled.push({ index: step.index, at: now, size, px: fill.avgPx, pnlUsd: r.side * size * (fill.avgPx - r.entryPx) });
  }
  const next: HedgeRecord = { ...r, settled };
  next.events = [
    ...r.events,
    {
      at: now,
      kind: "settled",
      message: `Settled ${steps.length} period(s): closed ${fill.filledSize} at ${fill.avgPx}`,
    },
  ];
  if (openSize(next) <= 1e-9 || settled.length >= r.schedule.length) {
    next.status = "closed";
    next.events.push({ at: now, kind: "closed", message: "Hedge fully settled" });
  }
  return next;
}

export function addEvent(r: HedgeRecord, kind: HedgeEvent["kind"], message: string, now = Date.now()): HedgeRecord {
  return { ...r, events: [...r.events, { at: now, kind, message }] };
}
