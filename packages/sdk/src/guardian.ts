import { distanceToLiquidation, equityForLiquidationPrice, type Side } from "./margin";
import { MIN_ORDER_USD } from "./planner";
import { applySettlement, addEvent, dueSteps, openSize, type HedgeRecord } from "./records";
import type { SettlementStep } from "./types";
import type { AccountState, ExecutionResult, HedgePosition, Venue } from "./venue";

export interface GuardianPolicy {
  /** Add margin when an adverse move of less than this would liquidate. */
  warnDistance: number;
  /** Top up until liquidation is this far away. */
  targetDistance: number;
  /** If it can't top up and liquidation is closer than this, shrink the hedge. */
  criticalDistance: number;
  /** Share of the position to close when critical. */
  reduceFraction: number;
  /** Never move more than this into one position per run. */
  maxTopUpUsd: number;
}

export const DEFAULT_POLICY: GuardianPolicy = {
  warnDistance: 0.25,
  targetDistance: 0.4,
  criticalDistance: 0.1,
  reduceFraction: 0.25,
  maxTopUpUsd: 250_000,
};

export type GuardianAction =
  | {
      kind: "add-margin";
      coin: string;
      side: Side;
      amountUsd: number;
      fromDistance: number;
      reason: string;
    }
  | { kind: "reduce"; coin: string; side: Side; size: number; reason: string }
  | {
      kind: "settle";
      coin: string;
      side: Side;
      hedgeId: string;
      steps: SettlementStep[];
      size: number;
      reason: string;
    }
  | { kind: "alert"; coin: string; level: "info" | "warning" | "critical"; message: string };

export interface PositionHealth {
  coin: string;
  distance: number;
  status: "healthy" | "watch" | "critical";
}

export function positionHealth(p: HedgePosition, policy = DEFAULT_POLICY): PositionHealth {
  const distance = distanceToLiquidation(p.side, p.markPx, p.liqPx);
  const status = distance < policy.criticalDistance ? "critical" : distance < policy.warnDistance ? "watch" : "healthy";
  return { coin: p.coin, distance, status };
}

/**
 * Decide what the guardian should do right now: keep hedges far from
 * liquidation, unwind the slices whose purchase dates have arrived, and flag
 * anything that doesn't reconcile. Pure function — execution is separate.
 */
export function evaluateGuardian(opts: {
  account: AccountState;
  hedges: HedgeRecord[];
  policy?: GuardianPolicy;
  now?: number;
}): GuardianAction[] {
  const { account, hedges, policy = DEFAULT_POLICY, now = Date.now() } = opts;
  const actions: GuardianAction[] = [];
  const open = hedges.filter((h) => h.status === "open");
  const coins = new Set(open.map((h) => h.coin));
  let available = account.availableUsd;

  for (const coin of coins) {
    const pos = account.positions.find((p) => p.coin === coin);
    const recs = open.filter((h) => h.coin === coin);
    const expected = recs.reduce((s, h) => s + h.side * openSize(h), 0);

    if (!pos) {
      actions.push({
        kind: "alert",
        coin,
        level: "critical",
        message: `No ${coin} position found, but Keel expects ${Math.abs(expected)} open. It may have been closed manually or liquidated.`,
      });
      continue;
    }

    const actual = pos.side * pos.size;
    if (Math.abs(actual - expected) > Math.max(1e-9, Math.abs(expected) * 0.02)) {
      actions.push({
        kind: "alert",
        coin,
        level: "warning",
        message: `Position is ${actual} but Keel hedges add up to ${expected}. Check for manual trades.`,
      });
    }

    // 1) Liquidation protection.
    const distance = distanceToLiquidation(pos.side, pos.markPx, pos.liqPx);
    if (distance < policy.warnDistance && pos.marginMode === "cross") {
      // Isolated top-ups don't apply; the whole account backs a cross position.
      actions.push({
        kind: "alert",
        coin,
        level: distance < policy.criticalDistance ? "critical" : "warning",
        message: `${coin} is cross-margined and ${(distance * 100).toFixed(1)}% from liquidation. Deposit USDC to the account.`,
      });
    } else if (distance < policy.warnDistance) {
      const targetLiq = pos.markPx * (1 - pos.side * policy.targetDistance);
      const needed =
        equityForLiquidationPrice(
          { side: pos.side, size: pos.size, price: pos.markPx, maxLeverage: pos.maxLeverage },
          targetLiq,
        ) - pos.equityUsd;
      const amount = Math.min(Math.max(0, needed), available, policy.maxTopUpUsd);
      if (amount >= 1) {
        actions.push({
          kind: "add-margin",
          coin,
          side: pos.side,
          amountUsd: round2(amount),
          fromDistance: distance,
          reason: `Liquidation is ${(distance * 100).toFixed(1)}% away. Adding margin to push it to ${(policy.targetDistance * 100).toFixed(0)}%.`,
        });
        available -= amount;
      }
      if (amount < needed - 1 && distance < policy.criticalDistance) {
        actions.push({
          kind: "reduce",
          coin,
          side: pos.side,
          size: pos.size * policy.reduceFraction,
          reason: `Not enough free collateral and liquidation is ${(distance * 100).toFixed(1)}% away. Shrinking the hedge by ${policy.reduceFraction * 100}% to keep the rest alive.`,
        });
      } else if (amount < needed - 1) {
        actions.push({
          kind: "alert",
          coin,
          level: "warning",
          message: `Hedge needs $${round2(needed)} more margin but only $${round2(amount)} is free. Deposit USDC to stay protected.`,
        });
      }
    }

    // 2) Scheduled settlements: close the slice that matches each purchase.
    for (const h of recs) {
      const due = dueSteps(h, now);
      if (due.length === 0) continue;
      const size = Math.min(
        due.reduce((s, x) => s + x.reduceSize, 0),
        openSize(h),
        pos.size,
      );
      const isFinal = due.some((s) => s.index === h.schedule.length - 1);
      if (size * pos.markPx < MIN_ORDER_USD && !isFinal) {
        actions.push({
          kind: "alert",
          coin,
          level: "info",
          message: `${h.label}: ${due.length} settlement(s) due but under the $${MIN_ORDER_USD} minimum. Batching with the next one.`,
        });
        continue;
      }
      actions.push({
        kind: "settle",
        coin,
        side: h.side,
        hedgeId: h.id,
        steps: due,
        size,
        reason: `${h.label}: purchase period ${due.map((s) => s.index + 1).join(", ")} reached. Releasing that part of the hedge.`,
      });
    }
  }

  return actions;
}

export interface GuardianRunResult {
  action: GuardianAction;
  ok: boolean;
  result?: ExecutionResult;
  error?: string;
}

/**
 * Execute guardian actions on a venue and return updated hedge records.
 * Alerts are recorded on the matching hedges but not executed.
 */
export async function runGuardianActions(
  venue: Venue,
  actions: GuardianAction[],
  hedges: HedgeRecord[],
  now = Date.now(),
): Promise<{ hedges: HedgeRecord[]; results: GuardianRunResult[] }> {
  let book = [...hedges];
  const results: GuardianRunResult[] = [];
  const update = (id: string, fn: (h: HedgeRecord) => HedgeRecord) => {
    book = book.map((h) => (h.id === id ? fn(h) : h));
  };

  for (const action of actions) {
    try {
      if (action.kind === "add-margin") {
        await venue.addMargin(action.coin, action.side, action.amountUsd);
        for (const h of book.filter((x) => x.coin === action.coin && x.status === "open")) {
          update(h.id, (r) => addEvent(r, "margin-added", `Guardian added $${action.amountUsd} margin`, now));
        }
        results.push({ action, ok: true });
      } else if (action.kind === "reduce") {
        const res = await venue.reduce(action.coin, action.side, action.size);
        if (res.status === "filled") {
          // Shrink every open hedge on this market pro rata so the book keeps reconciling.
          const recs = book.filter((x) => x.coin === action.coin && x.status === "open");
          const total = recs.reduce((s, h) => s + openSize(h), 0);
          for (const h of recs) {
            const cut = total > 0 ? (res.filledSize * openSize(h)) / total : 0;
            update(h.id, (r) =>
              addEvent({ ...r, size: r.size - cut }, "reduced", `Guardian cut the hedge by ${cut.toFixed(4)} to avoid liquidation`, now),
            );
          }
        }
        results.push({ action, ok: res.status === "filled", result: res, error: res.message });
      } else if (action.kind === "settle") {
        const res = await venue.reduce(action.coin, action.side, action.size);
        if (res.status === "filled") update(action.hedgeId, (r) => applySettlement(r, action.steps, res, now));
        results.push({ action, ok: res.status === "filled", result: res, error: res.message });
      } else {
        results.push({ action, ok: true });
      }
    } catch (err) {
      results.push({ action, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { hedges: book, results };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
