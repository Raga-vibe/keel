import type { HedgePlan, Scenario } from "./types";

export const DEFAULT_SHOCKS = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];

/**
 * What happens to the business if the benchmark price jumps or drops, with and
 * without the hedge. Shocks apply to the whole remaining exposure at once,
 * which is the worst case for a schedule of purchases.
 */
export function runScenarios(plan: HedgePlan, shocks: number[] = DEFAULT_SHOCKS): Scenario[] {
  const { refPx, side, size, marginUsd, liqPx, exposure, totalUserQty, unit, input } = plan;
  const dir = input.direction === "buy" ? 1 : -1;
  const qtyInInstrument = totalUserQty * unit.toInstrument;

  return shocks.map((shock) => {
    const newPx = refPx * (1 + shock);

    // Extra cost for buyers / lost revenue for sellers, in USD.
    let unhedgedImpactUsd: number;
    if (exposure.inverseQuote) {
      // Paying (or receiving) X foreign units costs X/P dollars.
      unhedgedImpactUsd = dir * (qtyInInstrument / newPx - qtyInInstrument / refPx);
    } else {
      unhedgedImpactUsd = dir * qtyInInstrument * (newPx - refPx);
    }

    const breachesLiquidation = side === 1 ? newPx <= liqPx : newPx >= liqPx;
    const rawPnl = side * size * (newPx - refPx);
    const hedgePnlUsd = breachesLiquidation ? -marginUsd : rawPnl;
    const netImpactUsd = unhedgedImpactUsd - hedgePnlUsd + plan.costs.totalUsd;

    return { shock, newPx, unhedgedImpactUsd, hedgePnlUsd, netImpactUsd, breachesLiquidation };
  });
}

/**
 * Share of price risk removed by the hedge for a given move, e.g. 0.8 means the
 * business keeps only 20% of the swing.
 */
export function protectionRatio(s: Scenario): number {
  if (s.unhedgedImpactUsd === 0) return 0;
  return s.hedgePnlUsd / s.unhedgedImpactUsd;
}
