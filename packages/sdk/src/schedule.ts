import type { Frequency, SettlementStep } from "./types";

const DAY = 24 * 3600 * 1000;

/** Add calendar months, clamping to month end (Jan 31 + 1 month → Feb 28/29). */
function addMonths(date: number, months: number): number {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return d.getTime();
}

export function addPeriod(date: number, frequency: Frequency, n = 1): number {
  switch (frequency) {
    case "weekly":
      return date + 7 * DAY * n;
    case "monthly":
      return addMonths(date, n);
    case "quarterly":
      return addMonths(date, 3 * n);
    case "once":
      return date + 90 * DAY * n;
  }
}

/** Round down to a lot size with `szDecimals` decimals, avoiding float noise. */
export function floorToLot(size: number, szDecimals: number): number {
  const f = 10 ** szDecimals;
  return Math.floor(size * f + 1e-9) / f;
}

/**
 * Split a hedge of `size` into equal reductions, one per settlement, so the
 * hedge shrinks as each purchase happens. The last step closes whatever is
 * left, which absorbs lot-size rounding.
 */
export function buildSchedule(opts: {
  size: number;
  szDecimals: number;
  userQtyPerPeriod: number;
  frequency: Frequency;
  periods: number;
  firstSettlement: number;
}): SettlementStep[] {
  const { size, szDecimals, userQtyPerPeriod, frequency, firstSettlement } = opts;
  const periods = frequency === "once" ? 1 : Math.max(1, Math.round(opts.periods));
  const perStep = floorToLot(size / periods, szDecimals);
  const steps: SettlementStep[] = [];
  let remaining = size;
  for (let i = 0; i < periods; i++) {
    const last = i === periods - 1;
    const reduce = last ? remaining : Math.min(perStep, remaining);
    remaining = last ? 0 : floorToLot(remaining - reduce, szDecimals);
    steps.push({
      index: i,
      date: i === 0 ? firstSettlement : addPeriod(firstSettlement, frequency, i),
      userQty: userQtyPerPeriod,
      reduceSize: floorToLot(reduce, szDecimals),
      remainingAfter: remaining,
    });
  }
  return steps;
}
