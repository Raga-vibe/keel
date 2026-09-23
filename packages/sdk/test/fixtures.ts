import type { MarketSnapshot } from "../src/markets";

export function market(coin: string, px: number, overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    coin,
    assetId: 110000,
    szDecimals: 2,
    maxLeverage: 20,
    onlyIsolated: false,
    markPx: px,
    oraclePx: px,
    midPx: px,
    prevDayPx: px,
    fundingHourly: 0,
    openInterestUsd: 100_000_000,
    dayVolumeUsd: 150_000_000,
    ...overrides,
  };
}

export function marketsMap(...ms: MarketSnapshot[]): Map<string, MarketSnapshot> {
  return new Map(ms.map((m) => [m.coin, m]));
}

export const NOW = Date.UTC(2026, 8, 24); // 24 Sep 2026
