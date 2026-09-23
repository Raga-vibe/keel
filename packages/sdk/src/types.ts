import type { ExposureDef, InstrumentDef, UnitDef } from "./catalog";
import type { Side } from "./margin";
import type { MarketSnapshot } from "./markets";

/** "buy": the business pays for this (hurt when price rises). "sell": it receives it (hurt when price falls). */
export type Direction = "buy" | "sell";
export type Frequency = "once" | "weekly" | "monthly" | "quarterly";

export interface ExposureInput {
  exposureId: string;
  unitId: string;
  /** Quantity per period, or the whole amount when frequency is "once". */
  quantity: number;
  frequency: Frequency;
  /** Number of upcoming purchases/sales to cover (1 for "once"). */
  periods: number;
  direction: Direction;
  /** Share of the exposure to hedge, 0–1. Most businesses hedge 50–80%. */
  hedgeRatio: number;
  /** Perp to hedge with. Defaults to the exposure's first instrument. */
  instrumentCoin?: string;
  /** First settlement date (ms). Defaults to one period from `now`. */
  firstSettlement?: number;
  /** Leverage for the isolated position. Defaults to the highest that keeps a 45% buffer. */
  leverage?: number;
  /** What the business pays today per user unit, all-in (optional, improves the report). */
  localPricePerUnit?: number;
  /** Free-text name, e.g. "Q4 fleet diesel". */
  label?: string;
}

export interface SettlementStep {
  index: number;
  /** Settlement date (ms). */
  date: number;
  /** Quantity of the underlying bought/sold in this period, in user units. */
  userQty: number;
  /** Hedge size to close at this settlement, in instrument units. */
  reduceSize: number;
  /** Hedge size left open after this settlement. */
  remainingAfter: number;
}

export type WarningLevel = "info" | "caution" | "blocker";

export interface PlanWarning {
  level: WarningLevel;
  code: string;
  message: string;
}

export interface PlanCosts {
  /** Exchange fees to open and progressively close the hedge. */
  tradingFeesUsd: number;
  /** Keel's builder fee, open + close. */
  builderFeesUsd: number;
  /** Expected funding paid (positive) or received (negative) over the schedule. */
  fundingUsd: number;
  /** Hourly funding rate used for the estimate. */
  fundingHourly: number;
  totalUsd: number;
  /** Total cost as a share of the hedged exposure's value. */
  totalPctOfHedged: number;
}

export interface HedgePlan {
  createdAt: number;
  input: ExposureInput;
  exposure: ExposureDef;
  instrument: InstrumentDef;
  unit: UnitDef;
  market: MarketSnapshot;
  side: Side;
  /** Total quantity across all periods, in user units. */
  totalUserQty: number;
  /** Size that would fully offset the exposure, in instrument units. */
  fullHedgeSize: number;
  /** Size to open after the hedge ratio and lot-size rounding. */
  size: number;
  sizeStr: string;
  /** Reference price (mid) used for the plan. */
  refPx: number;
  exposureUsd: number;
  notionalUsd: number;
  leverage: number;
  marginUsd: number;
  liqPx: number;
  /** Adverse move that would liquidate the hedge, as a fraction. */
  liqDistance: number;
  /**
   * Instrument-price component locked per user unit, e.g. crude cost per litre.
   * Null for inverse FX quotes, where `lockedRate` is the meaningful number.
   */
  lockedPerUserUnit: number | null;
  /** Rate locked for FX exposures (quote currency per base), or the perp price otherwise. */
  lockedRate: number;
  horizonDays: number;
  costs: PlanCosts;
  schedule: SettlementStep[];
  warnings: PlanWarning[];
}

export interface Scenario {
  /** Fractional price move applied to the perp price, e.g. 0.2 = +20%. */
  shock: number;
  newPx: number;
  /** Extra cost (buyers) or lost revenue (sellers) without a hedge. Positive = bad. */
  unhedgedImpactUsd: number;
  /** Profit on the hedge position. Positive = hedge pays out. */
  hedgePnlUsd: number;
  /** Impact after the hedge, including estimated costs. */
  netImpactUsd: number;
  /** Move breaches the planned liquidation price (the guardian would add margin first). */
  breachesLiquidation: boolean;
}
