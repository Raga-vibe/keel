import { liquidationPrice, type Side } from "./margin";
import type { MarketSnapshot } from "./markets";
import { builderFeeFraction, type KeelConfig } from "./network";
import type { HedgePlan } from "./types";
import type { AccountState, ExecutionMode, ExecutionResult, HedgePosition, Venue } from "./venue";

/** Minimal key-value store so the paper venue works in browsers and Node. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

interface PaperPosition {
  coin: string;
  assetId: number;
  side: Side;
  size: number;
  entryPx: number;
  /** Isolated margin deposited (excludes unrealised PnL). */
  margin: number;
  leverage: number;
  maxLeverage: number;
  fundingSinceOpen: number;
  lastAccrual: number;
}

interface PaperState {
  cash: number;
  positions: PaperPosition[];
  /** Log of paper liquidations, so the UI can surface them. */
  liquidations: { coin: string; at: number; lossUsd: number }[];
}

export const PAPER_STARTING_CASH = 100_000;
/** Simulated half-spread + impact applied to every paper fill. */
const PAPER_SLIPPAGE = 0.0002;

/**
 * Simulated venue: fills at live Hyperliquid prices, charges estimated fees and
 * accrues funding hourly. Lets judges and new users walk the full flow with no
 * wallet or funds.
 */
export class PaperVenue implements Venue {
  readonly kind = "paper" as const;

  constructor(
    private readonly opts: {
      user: `0x${string}`;
      config: KeelConfig;
      store: KeyValueStore;
      /** Fresh market snapshots (usually mainnet prices). */
      markets: () => Promise<Map<string, MarketSnapshot>>;
      now?: () => number;
    },
  ) {}

  private get key() {
    return `keel:paper:${this.opts.user.toLowerCase()}`;
  }

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private load(): PaperState {
    const raw = this.opts.store.get(this.key);
    if (raw) {
      try {
        return JSON.parse(raw) as PaperState;
      } catch {
        /* fall through to a fresh account */
      }
    }
    return { cash: PAPER_STARTING_CASH, positions: [], liquidations: [] };
  }

  private save(s: PaperState) {
    this.opts.store.set(this.key, JSON.stringify(s));
  }

  reset() {
    this.save({ cash: PAPER_STARTING_CASH, positions: [], liquidations: [] });
  }

  /** Accrue funding and apply liquidations at current prices. */
  private settle(s: PaperState, markets: Map<string, MarketSnapshot>): PaperState {
    const now = this.now();
    const kept: PaperPosition[] = [];
    for (const p of s.positions) {
      const m = markets.get(p.coin);
      if (!m) {
        kept.push(p);
        continue;
      }
      const hours = Math.max(0, (now - p.lastAccrual) / 3_600_000);
      const funding = p.side * p.size * m.markPx * m.fundingHourly * hours;
      p.margin -= funding;
      p.fundingSinceOpen += funding;
      p.lastAccrual = now;
      const equity = p.margin + p.side * p.size * (m.markPx - p.entryPx);
      const liq = liquidationPrice({ side: p.side, size: p.size, price: m.markPx, equity, maxLeverage: p.maxLeverage });
      const liquidated = p.side === 1 ? m.markPx <= liq : m.markPx >= liq;
      if (liquidated) {
        s.liquidations.push({ coin: p.coin, at: now, lossUsd: p.margin });
        continue;
      }
      kept.push(p);
    }
    s.positions = kept;
    return s;
  }

  async getAccount(): Promise<AccountState> {
    const markets = await this.opts.markets();
    const s = this.settle(this.load(), markets);
    this.save(s);
    const positions: HedgePosition[] = s.positions.map((p) => {
      const m = markets.get(p.coin);
      const mark = m?.markPx ?? p.entryPx;
      const upnl = p.side * p.size * (mark - p.entryPx);
      const equity = p.margin + upnl;
      return {
        coin: p.coin,
        assetId: p.assetId,
        side: p.side,
        size: p.size,
        entryPx: p.entryPx,
        markPx: mark,
        equityUsd: equity,
        unrealizedPnlUsd: upnl,
        leverage: p.leverage,
        marginMode: "isolated" as const,
        maxLeverage: p.maxLeverage,
        liqPx: liquidationPrice({ side: p.side, size: p.size, price: mark, equity, maxLeverage: p.maxLeverage }),
        fundingSinceOpenUsd: p.fundingSinceOpen,
      };
    });
    return { user: this.opts.user, availableUsd: s.cash, positions, updatedAt: this.now() };
  }

  paperLiquidations() {
    return this.load().liquidations;
  }

  private feeRate() {
    return this.opts.config.estTakerFee + builderFeeFraction(this.opts.config);
  }

  async openHedge(plan: HedgePlan, _mode: ExecutionMode = "market"): Promise<ExecutionResult> {
    const markets = await this.opts.markets();
    const m = markets.get(plan.market.coin);
    if (!m) return { status: "error", filledSize: 0, avgPx: 0, message: `Unknown market ${plan.market.coin}` };
    const s = this.settle(this.load(), markets);
    const px = m.midPx * (1 + plan.side * PAPER_SLIPPAGE);
    const notional = plan.size * px;
    const margin = notional / plan.leverage;
    const fee = notional * this.feeRate();
    if (margin + fee > s.cash) {
      return { status: "error", filledSize: 0, avgPx: 0, message: "Insufficient paper balance" };
    }
    s.cash -= margin + fee;

    const existing = s.positions.find((p) => p.coin === m.coin);
    if (existing && existing.side !== plan.side) {
      s.cash += margin + fee;
      return { status: "error", filledSize: 0, avgPx: 0, message: "Opposite position already open on this market" };
    }
    if (existing) {
      const total = existing.size + plan.size;
      existing.entryPx = (existing.entryPx * existing.size + px * plan.size) / total;
      existing.size = total;
      existing.margin += margin;
      existing.leverage = plan.leverage;
    } else {
      s.positions.push({
        coin: m.coin,
        assetId: m.assetId,
        side: plan.side,
        size: plan.size,
        entryPx: px,
        margin,
        leverage: plan.leverage,
        maxLeverage: m.maxLeverage,
        fundingSinceOpen: 0,
        lastAccrual: this.now(),
      });
    }
    this.save(s);
    return { status: "filled", filledSize: plan.size, avgPx: px, oid: Math.floor(this.now() / 1000) };
  }

  async reduce(coin: string, side: Side, size: number): Promise<ExecutionResult> {
    const markets = await this.opts.markets();
    const m = markets.get(coin);
    const s = this.settle(this.load(), markets);
    const p = s.positions.find((x) => x.coin === coin && x.side === side);
    if (!m || !p) return { status: "error", filledSize: 0, avgPx: 0, message: "No open position to reduce" };
    const closeSize = Math.min(size, p.size);
    const px = m.midPx * (1 - side * PAPER_SLIPPAGE);
    const share = closeSize / p.size;
    const pnl = side * closeSize * (px - p.entryPx);
    const releasedMargin = p.margin * share;
    const fee = closeSize * px * this.feeRate();
    s.cash += releasedMargin + pnl - fee;
    p.margin -= releasedMargin;
    p.size -= closeSize;
    if (p.size <= 1e-12) s.positions = s.positions.filter((x) => x !== p);
    this.save(s);
    return { status: "filled", filledSize: closeSize, avgPx: px, oid: Math.floor(this.now() / 1000) };
  }

  async addMargin(coin: string, side: Side, amountUsd: number): Promise<void> {
    const s = this.load();
    const p = s.positions.find((x) => x.coin === coin && x.side === side);
    if (!p) throw new Error("No open position");
    const amt = Math.min(amountUsd, s.cash);
    s.cash -= amt;
    p.margin += amt;
    this.save(s);
  }
}
