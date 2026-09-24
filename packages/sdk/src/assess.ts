import type { InfoClient } from "@nktkas/hyperliquid";
import { EXPOSURES, type ExposureDef } from "./catalog";
import { DEFAULT_POLICY, type GuardianPolicy } from "./guardian";
import { distanceToLiquidation, equityForLiquidationPrice, type Side } from "./margin";
import type { MarketSnapshot } from "./markets";
import type { AccountState, HedgePosition } from "./venue";

export type HealthStatus = "healthy" | "watch" | "critical" | "no-liquidation";

export interface ExposureEquivalent {
  exposureId: string;
  label: string;
  /** "buy": this position protects someone who buys the underlying. */
  direction: "buy" | "sell";
  qty: number;
  unitLabel: string;
}

export interface PositionAssessment {
  position: HedgePosition;
  notionalUsd: number;
  distance: number;
  status: HealthStatus;
  /** Extra isolated margin that would push liquidation to the policy target. Null for cross margin. */
  topUpUsd: number | null;
  /** Typical annualised funding from this position's point of view (+ = it pays). */
  carryApr: number | null;
  /** Real-world business exposures this position would offset. */
  equivalents: ExposureEquivalent[];
  /** What Keel's guardian would do with this position, in plain language. */
  recommendation: string;
  /** Position is on a benchmark in Keel's catalog (commodities / FX). */
  inCatalog: boolean;
}

const FUEL = new Set(["diesel", "gasoline", "jetfuel"]);

function catalogFor(coin: string): ExposureDef[] {
  return EXPOSURES.filter((e) => e.instruments.some((i) => i.coin === coin));
}

/**
 * Translate a perp position into the business exposure it offsets, e.g.
 * long 1,000 bbl Brent ≈ protection on 159,000 L of diesel purchases.
 */
export function exposureEquivalents(coin: string, side: Side, size: number, price: number): ExposureEquivalent[] {
  const list = catalogFor(coin).map((e): ExposureEquivalent => {
    // For inverse quotes (USD/JPY) the size is in USD; X yen ≈ size·P² at the margin.
    const instrumentQty = e.inverseQuote ? size * price * price : size;
    const hedgesBuyer = e.inverseQuote ? side === -1 : side === 1;
    // Fuel reads best in litres; other things in the largest unit that stays ≥ 1.
    const units = FUEL.has(e.id)
      ? [e.units[0]!]
      : [...e.units].sort((a, b) => b.toInstrument - a.toInstrument);
    const unit = units.find((u) => instrumentQty / u.toInstrument >= 1) ?? units[units.length - 1]!;
    return {
      exposureId: e.id,
      label: e.label,
      direction: hedgesBuyer ? "buy" : "sell",
      qty: instrumentQty / unit.toInstrument,
      unitLabel: unit.label,
    };
  });
  // Short oil reads as crude production, not "sales of diesel": fuel goes last for sellers.
  return list.sort((a, b) =>
    a.direction === "sell" ? Number(FUEL.has(a.exposureId)) - Number(FUEL.has(b.exposureId)) : 0,
  );
}

export function assessPosition(
  pos: HedgePosition,
  market?: MarketSnapshot,
  policy: GuardianPolicy = DEFAULT_POLICY,
): PositionAssessment {
  const notionalUsd = pos.size * pos.markPx;
  const distance = distanceToLiquidation(pos.side, pos.markPx, pos.liqPx);
  const noLiq = !Number.isFinite(distance) || (pos.side === 1 && pos.liqPx <= 0);
  const status: HealthStatus = noLiq
    ? "no-liquidation"
    : distance < policy.criticalDistance
      ? "critical"
      : distance < policy.warnDistance
        ? "watch"
        : "healthy";

  let topUpUsd: number | null = null;
  if (pos.marginMode === "isolated" && !noLiq) {
    const target = pos.markPx * (1 - pos.side * policy.targetDistance);
    const needed =
      equityForLiquidationPrice({ side: pos.side, size: pos.size, price: pos.markPx, maxLeverage: pos.maxLeverage }, target) -
      pos.equityUsd;
    topUpUsd = Math.max(0, needed);
  }

  const funding = market ? (market.fundingHourlyTypical ?? market.fundingHourly) : undefined;
  const carryApr = funding === undefined ? null : pos.side * funding * 24 * 365;
  const inCatalog = catalogFor(pos.coin).length > 0;

  let recommendation: string;
  // Over-collateralised cross positions can report liquidation prices many times away; cap the wording.
  const pctTxt = distance >= 1 ? "more than 100%" : `${(distance * 100).toFixed(1)}%`;
  if (status === "no-liquidation") {
    recommendation = "Fully collateralised. No liquidation risk at any price.";
  } else if (status === "healthy") {
    recommendation = `Liquidation is ${pctTxt} away. Nothing to do.`;
  } else if (pos.marginMode === "cross") {
    recommendation = `Liquidation is ${pctTxt} away on a cross-margin account. Keel would move this hedge to isolated margin and fund it to a ${(policy.targetDistance * 100).toFixed(0)}% buffer.`;
  } else {
    recommendation = `Liquidation is ${pctTxt} away. Keel's guardian would add $${Math.round(topUpUsd ?? 0).toLocaleString("en-US")} of margin to restore a ${(policy.targetDistance * 100).toFixed(0)}% buffer${status === "critical" ? ", or cut the position if cash runs short" : ""}.`;
  }

  return {
    position: pos,
    notionalUsd,
    distance,
    status,
    topUpUsd,
    carryApr,
    equivalents: exposureEquivalents(pos.coin, pos.side, pos.size, pos.markPx),
    recommendation,
    inCatalog,
  };
}

export interface AccountAssessment {
  account: AccountState;
  positions: PositionAssessment[];
  notionalUsd: number;
  atRisk: number;
}

export function assessAccount(
  account: AccountState,
  markets: Map<string, MarketSnapshot>,
  policy: GuardianPolicy = DEFAULT_POLICY,
): AccountAssessment {
  const positions = account.positions
    .map((p) => assessPosition(p, markets.get(p.coin), policy))
    .sort((a, b) => Number(b.inCatalog) - Number(a.inCatalog) || b.notionalUsd - a.notionalUsd);
  return {
    account,
    positions,
    notionalUsd: positions.reduce((s, p) => s + p.notionalUsd, 0),
    atRisk: positions.filter((p) => p.status === "watch" || p.status === "critical").length,
  };
}

export interface ActiveAccount {
  address: `0x${string}`;
  /** Catalog benchmarks this address traded recently. */
  coins: string[];
}

/**
 * Find addresses that recently traded the given benchmarks, from Hyperliquid's
 * public trade feed. Used to offer real accounts to inspect in watch mode.
 */
export async function findActiveAccounts(info: InfoClient, coins: string[], limit = 12): Promise<ActiveAccount[]> {
  const trades = await Promise.all(coins.map((coin) => info.recentTrades({ coin }).catch(() => [])));
  const byUser = new Map<`0x${string}`, Set<string>>();
  trades.flat().forEach((t) => {
    for (const u of t.users) {
      if (!byUser.has(u)) byUser.set(u, new Set());
      byUser.get(u)!.add(t.coin);
    }
  });
  return [...byUser.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, limit)
    .map(([address, set]) => ({ address, coins: [...set] }));
}
