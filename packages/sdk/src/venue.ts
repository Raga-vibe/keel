import type { Side } from "./margin";
import type { HedgePlan } from "./types";

/** A hedge position as Keel sees it, independent of where it lives. */
export interface HedgePosition {
  coin: string;
  assetId: number;
  side: Side;
  /** Absolute size in instrument units. */
  size: number;
  entryPx: number;
  markPx: number;
  /** Position equity: isolated margin + unrealised PnL. */
  equityUsd: number;
  unrealizedPnlUsd: number;
  leverage: number;
  /** Keel opens isolated hedges; other accounts may hold cross-margined positions. */
  marginMode: "isolated" | "cross";
  maxLeverage: number;
  liqPx: number;
  /** Funding paid since the position opened (negative = received). */
  fundingSinceOpenUsd: number;
}

export interface AccountState {
  user: `0x${string}`;
  /** Collateral that can be moved into positions as extra margin. */
  availableUsd: number;
  /** Account value on the HIP-3 dex (margin + unrealised PnL), when known. */
  accountValueUsd?: number;
  positions: HedgePosition[];
  updatedAt: number;
}

export type ExecutionMode = "market" | "limit";

export interface ExecutionResult {
  status: "filled" | "resting" | "error";
  filledSize: number;
  avgPx: number;
  oid?: number;
  message?: string;
}

/**
 * Where hedges are executed. `LiveVenue` trades on Hyperliquid; `PaperVenue`
 * simulates fills against live prices so anyone can try Keel without funds.
 */
export interface Venue {
  readonly kind: "live" | "paper";
  getAccount(): Promise<AccountState>;
  openHedge(plan: HedgePlan, mode?: ExecutionMode): Promise<ExecutionResult>;
  /** Reduce-only close of `size` on an existing position. */
  reduce(coin: string, side: Side, size: number): Promise<ExecutionResult>;
  addMargin(coin: string, side: Side, amountUsd: number): Promise<void>;
}
