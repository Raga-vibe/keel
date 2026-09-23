/**
 * Isolated-margin math, following Hyperliquid's liquidation rules:
 * a position is liquidated when its equity falls to the maintenance margin,
 * and maintenance margin is half the initial margin at max leverage.
 *
 * With side s (+1 long, -1 short), size S > 0, reference price P, position
 * equity E (margin + unrealised PnL at P) and maintenance rate l:
 *
 *     E + s·S·(Pliq − P) = l·S·Pliq   ⇒   Pliq = (s·P − E/S) / (s − l)
 */

export type Side = 1 | -1;

export function maintenanceRate(maxLeverage: number): number {
  return 1 / (2 * maxLeverage);
}

export interface LiqInput {
  side: Side;
  /** Absolute position size in instrument units. */
  size: number;
  /** Reference price (entry price when opening, mark price for live positions). */
  price: number;
  /** Position equity at `price`: isolated margin + unrealised PnL. */
  equity: number;
  maxLeverage: number;
}

export function liquidationPrice({ side, size, price, equity, maxLeverage }: LiqInput): number {
  if (size <= 0) return side === 1 ? 0 : Infinity;
  const l = maintenanceRate(maxLeverage);
  const px = (side * price - equity / size) / (side - l);
  return Math.max(0, px);
}

/** Equity a position needs so its liquidation price sits at `targetLiqPx`. */
export function equityForLiquidationPrice(
  { side, size, price, maxLeverage }: Omit<LiqInput, "equity">,
  targetLiqPx: number,
): number {
  const l = maintenanceRate(maxLeverage);
  return size * (side * price - targetLiqPx * (side - l));
}

/** Fractional adverse move from `price` that would trigger liquidation. */
export function distanceToLiquidation(side: Side, price: number, liqPx: number): number {
  if (!Number.isFinite(liqPx)) return Infinity;
  return side === 1 ? (price - liqPx) / price : (liqPx - price) / price;
}

export function initialMargin(notional: number, leverage: number): number {
  return notional / leverage;
}

/**
 * Pick the highest leverage whose liquidation sits at least `minBuffer`
 * (fractional adverse move) away. Low leverage keeps hedges alive through
 * large moves; higher leverage ties up less cash.
 */
export function leverageForBuffer(side: Side, maxLeverage: number, minBuffer: number): number {
  for (let lev = maxLeverage; lev >= 1; lev--) {
    const liq = liquidationPrice({ side, size: 1, price: 1, equity: 1 / lev, maxLeverage });
    if (distanceToLiquidation(side, 1, liq) >= minBuffer) return lev;
  }
  return 1;
}
