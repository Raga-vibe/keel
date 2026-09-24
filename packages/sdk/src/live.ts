import { ExchangeClient, type InfoClient } from "@nktkas/hyperliquid";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import type { Side } from "./margin";
import { loadMarkets, type MarketSnapshot } from "./markets";
import type { KeelConfig } from "./network";
import type { HedgePlan } from "./types";
import type { AccountState, ExecutionMode, ExecutionResult, HedgePosition, Venue } from "./venue";

export interface LiveVenueOptions {
  config: KeelConfig;
  info: InfoClient;
  /** Exchange client signed by the Keel agent wallet (trades, cannot withdraw). */
  exchange: ExchangeClient;
  /** The user's main account address that the agent trades for. */
  user: `0x${string}`;
}

type OrderStatus =
  | { filled: { totalSz: string; avgPx: string; oid: number } }
  | { resting: { oid: number } }
  | { error: string }
  | string;

/** Executes hedges on Hyperliquid through an approved agent wallet. */
export class LiveVenue implements Venue {
  readonly kind = "live" as const;
  private markets = new Map<string, MarketSnapshot>();

  constructor(private readonly opts: LiveVenueOptions) {}

  private async market(coin: string, refresh = false): Promise<MarketSnapshot> {
    if (refresh || !this.markets.has(coin)) {
      this.markets = await loadMarkets(this.opts.info, this.opts.config.dex);
    }
    const m = this.markets.get(coin);
    if (!m) throw new Error(`Unknown market ${coin}`);
    return m;
  }

  async getAccount(): Promise<AccountState> {
    return readAccount(this.opts.info, this.opts.user, this.opts.config.dex);
  }

  async openHedge(plan: HedgePlan, mode: ExecutionMode = "market"): Promise<ExecutionResult> {
    const m = await this.market(plan.market.coin, true);
    await this.opts.exchange.updateLeverage({ asset: m.assetId, isCross: false, leverage: plan.leverage });
    return this.placeOrder(m, plan.side === 1, plan.size, false, mode);
  }

  async reduce(coin: string, side: Side, size: number): Promise<ExecutionResult> {
    const m = await this.market(coin, true);
    // Closing a long is a sell, closing a short is a buy.
    return this.placeOrder(m, side === -1, size, true, "market");
  }

  async addMargin(coin: string, side: Side, amountUsd: number): Promise<void> {
    const m = await this.market(coin);
    await this.opts.exchange.updateIsolatedMargin({
      asset: m.assetId,
      isBuy: side === 1,
      ntli: Math.round(amountUsd * 1e6),
    });
  }

  private async placeOrder(
    m: MarketSnapshot,
    isBuy: boolean,
    size: number,
    reduceOnly: boolean,
    mode: ExecutionMode,
  ): Promise<ExecutionResult> {
    const { config } = this.opts;
    const ref = m.midPx > 0 ? m.midPx : m.markPx;
    // Market = IOC with a slippage cap. Limit = rest at the oracle price and wait.
    const px = mode === "market" ? ref * (isBuy ? 1 + config.maxSlippage : 1 - config.maxSlippage) : m.oraclePx;
    try {
      const res = await this.opts.exchange.order({
        orders: [
          {
            a: m.assetId,
            b: isBuy,
            p: formatPrice(px, m.szDecimals),
            s: formatSize(size, m.szDecimals),
            r: reduceOnly,
            t: { limit: { tif: mode === "market" ? "Ioc" : "Gtc" } },
          },
        ],
        grouping: "na",
        ...(config.builderAddress ? { builder: { b: config.builderAddress, f: config.builderFeeTenthsBp } } : {}),
      });
      return parseStatus(res.response.data.statuses[0] as OrderStatus | undefined);
    } catch (err) {
      return { status: "error", filledSize: 0, avgPx: 0, message: errorMessage(err) };
    }
  }
}

function parseStatus(s: OrderStatus | undefined): ExecutionResult {
  if (!s) return { status: "error", filledSize: 0, avgPx: 0, message: "No order status returned" };
  if (typeof s === "string") return { status: "error", filledSize: 0, avgPx: 0, message: s };
  if ("filled" in s) {
    return { status: "filled", filledSize: Number(s.filled.totalSz), avgPx: Number(s.filled.avgPx), oid: s.filled.oid };
  }
  if ("resting" in s) return { status: "resting", filledSize: 0, avgPx: 0, oid: s.resting.oid };
  return { status: "error", filledSize: 0, avgPx: 0, message: s.error };
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Read a user's HIP-3 positions and free collateral. */
export async function readAccount(info: InfoClient, user: `0x${string}`, dex: string): Promise<AccountState> {
  const [abstraction, dexState, mainState, spot, markets] = await Promise.all([
    info.userAbstraction({ user }).catch(() => "default" as const),
    info.clearinghouseState({ user, dex }),
    info.clearinghouseState({ user }),
    info.spotClearinghouseState({ user }),
    loadMarkets(info, dex),
  ]);

  const positions: HedgePosition[] = [];
  for (const { position: p } of dexState.assetPositions) {
    const szi = Number(p.szi);
    if (szi === 0) continue;
    const m = markets.get(p.coin);
    positions.push({
      coin: p.coin,
      assetId: m?.assetId ?? -1,
      side: szi > 0 ? 1 : -1,
      size: Math.abs(szi),
      entryPx: Number(p.entryPx),
      markPx: m?.markPx ?? Number(p.positionValue) / Math.abs(szi),
      equityUsd: Number(p.marginUsed),
      unrealizedPnlUsd: Number(p.unrealizedPnl),
      leverage: p.leverage.value,
      marginMode: p.leverage.type,
      maxLeverage: p.maxLeverage,
      liqPx: p.liquidationPx === null ? (szi > 0 ? 0 : Infinity) : Number(p.liquidationPx),
      fundingSinceOpenUsd: Number(p.cumFunding.sinceOpen),
    });
  }

  // Unified accounts collateralise HIP-3 margin from the spot USDC balance;
  // otherwise DEX abstraction pulls from the main perps balance.
  const usdc = spot.balances.find((b) => b.coin === "USDC");
  const spotFree = usdc ? Number(usdc.total) - Number(usdc.hold) : 0;
  const unified = abstraction === "unifiedAccount" || abstraction === "portfolioMargin";
  const availableUsd = unified ? spotFree : Number(mainState.withdrawable) + Number(dexState.withdrawable);

  return {
    user,
    availableUsd,
    accountValueUsd: Number(dexState.marginSummary.accountValue),
    positions,
    updatedAt: Date.now(),
  };
}
