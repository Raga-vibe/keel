import { formatSize } from "@nktkas/hyperliquid/utils";
import { getExposure, getInstrument, getUnit } from "./catalog";
import {
  distanceToLiquidation,
  initialMargin,
  leverageForBuffer,
  liquidationPrice,
  type Side,
} from "./margin";
import type { MarketSnapshot } from "./markets";
import { builderFeeFraction, type KeelConfig } from "./network";
import { addPeriod, buildSchedule, floorToLot } from "./schedule";
import type { ExposureInput, HedgePlan, PlanCosts, PlanWarning, SettlementStep } from "./types";

/** Hyperliquid rejects orders below $10 notional. */
export const MIN_ORDER_USD = 10;
/** Default adverse-move buffer before liquidation when leverage is not specified. */
export const DEFAULT_LIQ_BUFFER = 0.45;
/** Major currencies rarely move 30% in a year, so FX hedges can tie up less cash. */
export const FX_LIQ_BUFFER = 0.3;
/** Never pick more than this leverage automatically — hedges should survive big moves. */
export const MAX_AUTO_LEVERAGE = 3;

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export interface PlanOptions {
  config: KeelConfig;
  now?: number;
}

/**
 * Turn a business exposure ("I buy 40,000 L of diesel a month for 6 months")
 * into a concrete hedge: side, size, leverage, margin, liquidation buffer,
 * expected costs and an unwind schedule that follows the purchases.
 */
export function planHedge(
  input: ExposureInput,
  markets: Map<string, MarketSnapshot>,
  { config, now = Date.now() }: PlanOptions,
): HedgePlan {
  const exposure = getExposure(input.exposureId);
  const unit = getUnit(exposure, input.unitId);
  const instrument = getInstrument(exposure, input.instrumentCoin);
  const market = markets.get(instrument.coin);
  if (!market) throw new Error(`Market ${instrument.coin} is not available on this network`);

  const warnings: PlanWarning[] = [];
  const periods = input.frequency === "once" ? 1 : Math.max(1, Math.round(input.periods));
  const totalUserQty = input.quantity * periods;
  const refPx = market.midPx > 0 ? market.midPx : market.markPx;

  // Direction: buyers are hurt by rising prices, so they go long the perp.
  // For inverse FX quotes (USD/JPY), paying yen is hurt by a *falling* quote.
  let side: Side = input.direction === "buy" ? 1 : -1;
  let fullHedgeSize: number;
  let exposureUsd: number;
  if (exposure.inverseQuote) {
    side = (side * -1) as Side;
    // Paying X yen costs X/P dollars. d(X/P)/dP = −X/P², so X/P² units offset it.
    fullHedgeSize = (totalUserQty * unit.toInstrument) / (refPx * refPx);
    exposureUsd = (totalUserQty * unit.toInstrument) / refPx;
  } else {
    fullHedgeSize = totalUserQty * unit.toInstrument;
    exposureUsd = fullHedgeSize * refPx;
  }

  const ratio = Math.max(0, input.hedgeRatio);
  if (ratio > 1) {
    warnings.push({
      level: "caution",
      code: "over-hedged",
      message: "Hedge ratio above 100% is a bet on the price, not protection.",
    });
  }

  const size = floorToLot(fullHedgeSize * ratio, market.szDecimals);
  const notionalUsd = size * refPx;

  const buffer = exposure.category === "fx" ? FX_LIQ_BUFFER : DEFAULT_LIQ_BUFFER;
  const autoLev = Math.min(MAX_AUTO_LEVERAGE, leverageForBuffer(side, market.maxLeverage, buffer));
  const leverage = Math.max(1, Math.min(market.maxLeverage, Math.round(input.leverage ?? autoLev)));
  const marginUsd = initialMargin(notionalUsd, leverage);
  const liqPx = liquidationPrice({ side, size, price: refPx, equity: marginUsd, maxLeverage: market.maxLeverage });
  const liqDistance = distanceToLiquidation(side, refPx, liqPx);

  const firstSettlement =
    input.firstSettlement ?? addPeriod(now, input.frequency === "once" ? "once" : input.frequency);
  const schedule = buildSchedule({
    size,
    szDecimals: market.szDecimals,
    userQtyPerPeriod: input.quantity,
    frequency: input.frequency,
    periods,
    firstSettlement,
  });
  const horizonDays = Math.max(0, (schedule[schedule.length - 1]!.date - now) / DAY);

  const costs = estimateCosts({ side, refPx, size, schedule, now, market, config });

  // --- warnings -------------------------------------------------------------
  if (size === 0 || notionalUsd < MIN_ORDER_USD) {
    warnings.push({
      level: "blocker",
      code: "too-small",
      message: `The hedge is worth $${notionalUsd.toFixed(2)}. Hyperliquid's minimum order is $${MIN_ORDER_USD}.`,
    });
  }
  const smallestStep = Math.min(...schedule.map((s) => s.reduceSize));
  if (size > 0 && smallestStep * refPx < MIN_ORDER_USD && schedule.length > 1) {
    warnings.push({
      level: "caution",
      code: "small-steps",
      message: "Each scheduled unwind is under $10, so Keel will batch unwinds until they clear the minimum order.",
    });
  }
  if (market.dayVolumeUsd > 0 && notionalUsd > 0.05 * market.dayVolumeUsd) {
    warnings.push({
      level: "caution",
      code: "liquidity",
      message: `This hedge is ${((notionalUsd / market.dayVolumeUsd) * 100).toFixed(1)}% of the market's 24h volume. Keel will execute it in slices to limit price impact.`,
    });
  } else if (market.dayVolumeUsd < 10_000_000) {
    warnings.push({
      level: "info",
      code: "thin-market",
      message: "This market trades under $10M a day. Fine for small hedges, but expect wider spreads.",
    });
  }
  if (leverage > 5) {
    warnings.push({
      level: "caution",
      code: "leverage",
      message: `At ${leverage}x, a ${(liqDistance * 100).toFixed(0)}% move liquidates the hedge. Keel recommends 3x or less.`,
    });
  }
  if (horizonDays > 400) {
    warnings.push({
      level: "info",
      code: "long-horizon",
      message: "Funding costs compound over long horizons. Review the hedge quarterly.",
    });
  }
  if (exposure.basisNote) warnings.push({ level: "info", code: "basis", message: exposure.basisNote });

  const lockedPerUserUnit = exposure.inverseQuote ? null : refPx * unit.toInstrument;

  return {
    createdAt: now,
    input,
    exposure,
    instrument,
    unit,
    market,
    side,
    totalUserQty,
    fullHedgeSize,
    size,
    sizeStr: size > 0 ? formatSize(size, market.szDecimals) : "0",
    refPx,
    exposureUsd,
    notionalUsd,
    leverage,
    marginUsd,
    liqPx,
    liqDistance,
    lockedPerUserUnit,
    lockedRate: refPx,
    horizonDays,
    costs,
    schedule,
    warnings,
  };
}

function estimateCosts(opts: {
  side: Side;
  refPx: number;
  size: number;
  schedule: SettlementStep[];
  now: number;
  market: MarketSnapshot;
  config: KeelConfig;
}): PlanCosts {
  const { side, refPx, size, schedule, now, market, config } = opts;
  const notional = size * refPx;
  // Open once, close progressively: total traded notional is roughly 2× the hedge.
  const traded = 2 * notional;
  const tradingFeesUsd = traded * config.estTakerFee;
  const builderFeesUsd = traded * builderFeeFraction(config);

  // Funding accrues hourly on the open size, which steps down at each settlement.
  const fundingHourly = market.fundingHourlyTypical ?? market.fundingHourly;
  let fundingUsd = 0;
  let open = size;
  let from = now;
  for (const step of schedule) {
    const hours = Math.max(0, (step.date - from) / HOUR);
    fundingUsd += side * open * refPx * fundingHourly * hours;
    open = step.remainingAfter;
    from = step.date;
  }

  const totalUsd = tradingFeesUsd + builderFeesUsd + fundingUsd;
  return {
    tradingFeesUsd,
    builderFeesUsd,
    fundingUsd,
    fundingHourly,
    totalUsd,
    totalPctOfHedged: notional > 0 ? totalUsd / notional : 0,
  };
}
