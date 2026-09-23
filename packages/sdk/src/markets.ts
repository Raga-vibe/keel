import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import type { NetworkId } from "./network";

export interface MarketSnapshot {
  coin: string;
  /** Asset id used in exchange actions (100000 + dexIndex * 10000 + index). */
  assetId: number;
  szDecimals: number;
  maxLeverage: number;
  /** Market only supports isolated margin. Keel uses isolated for every hedge anyway. */
  onlyIsolated: boolean;
  markPx: number;
  oraclePx: number;
  midPx: number;
  prevDayPx: number;
  /** Current hourly funding rate (positive = longs pay shorts). */
  fundingHourly: number;
  /** Median hourly funding over the lookback window, if fetched. */
  fundingHourlyTypical?: number;
  openInterestUsd: number;
  dayVolumeUsd: number;
}

export function makeInfoClient(network: NetworkId): InfoClient {
  return new InfoClient({ transport: new HttpTransport({ isTestnet: network === "testnet" }) });
}

/** Resolve the index of a HIP-3 dex in `perpDexs` (index 0 is the validator-run dex). */
export async function getDexIndex(info: InfoClient, dex: string): Promise<number> {
  const dexs = await info.perpDexs();
  const idx = dexs.findIndex((d) => d !== null && d.name === dex);
  if (idx < 1) throw new Error(`HIP-3 dex "${dex}" not found on this network`);
  return idx;
}

/**
 * Load live snapshots for every market on a HIP-3 dex (or only `coins`, if given).
 */
export async function loadMarkets(
  info: InfoClient,
  dex: string,
  coins?: string[],
): Promise<Map<string, MarketSnapshot>> {
  const [dexIndex, [meta, ctxs]] = await Promise.all([
    getDexIndex(info, dex),
    info.metaAndAssetCtxs({ dex }),
  ]);
  const wanted = coins ? new Set(coins) : undefined;
  const out = new Map<string, MarketSnapshot>();
  meta.universe.forEach((u, i) => {
    const ctx = ctxs[i];
    if (!ctx || u.isDelisted || (wanted && !wanted.has(u.name))) return;
    const markPx = Number(ctx.markPx);
    out.set(u.name, {
      coin: u.name,
      assetId: 100000 + dexIndex * 10000 + i,
      szDecimals: u.szDecimals,
      maxLeverage: u.maxLeverage,
      onlyIsolated: Boolean(u.onlyIsolated),
      markPx,
      oraclePx: Number(ctx.oraclePx),
      midPx: ctx.midPx ? Number(ctx.midPx) : markPx,
      prevDayPx: Number(ctx.prevDayPx),
      fundingHourly: Number(ctx.funding),
      openInterestUsd: Number(ctx.openInterest) * markPx,
      dayVolumeUsd: Number(ctx.dayNtlVlm),
    });
  });
  return out;
}

/**
 * Typical (median) hourly funding over the last `days` days. The median is
 * used instead of the mean because short squeezes produce funding spikes 50–100×
 * the usual rate that would dominate a mean and mislead a months-long plan.
 */
export async function typicalFunding(info: InfoClient, coin: string, days = 14): Promise<number | undefined> {
  const startTime = Date.now() - days * 24 * 3600 * 1000;
  const hist = await info.fundingHistory({ coin, startTime });
  if (hist.length === 0) return undefined;
  const rates = hist.map((h) => Number(h.fundingRate)).sort((a, b) => a - b);
  const mid = rates.length >> 1;
  return rates.length % 2 ? rates[mid]! : (rates[mid - 1]! + rates[mid]!) / 2;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export async function loadCandles(
  info: InfoClient,
  coin: string,
  interval: "1h" | "4h" | "1d" = "1d",
  days = 90,
): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 3600 * 1000;
  const rows = await info.candleSnapshot({ coin, interval, startTime, endTime });
  return rows.map((r) => ({ t: r.t, o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c) }));
}

/** Annualised volatility from daily closes (used to size margin buffers and warnings). */
export function annualisedVol(candles: Candle[]): number | undefined {
  if (candles.length < 10) return undefined;
  const rets: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!.c;
    const cur = candles[i]!.c;
    if (prev > 0 && cur > 0) rets.push(Math.log(cur / prev));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  // Perps print a candle every calendar day (flat on weekends for commodity oracles),
  // so scale by calendar days to recover annual variance.
  return Math.sqrt(variance) * Math.sqrt(365);
}
