import { describe, expect, it } from "vitest";
import {
  distanceToLiquidation,
  equityForLiquidationPrice,
  leverageForBuffer,
  liquidationPrice,
  maintenanceRate,
} from "../src/margin";

describe("liquidation math", () => {
  it("uses half the initial margin at max leverage as maintenance", () => {
    expect(maintenanceRate(20)).toBeCloseTo(0.025);
  });

  it("long 2x on a 20x market liquidates ~49% below entry", () => {
    const liq = liquidationPrice({ side: 1, size: 1, price: 100, equity: 50, maxLeverage: 20 });
    expect(liq).toBeCloseTo(50 / 0.975, 6);
    expect(distanceToLiquidation(1, 100, liq)).toBeCloseTo(0.4872, 3);
  });

  it("short 2x liquidates ~46% above entry", () => {
    const liq = liquidationPrice({ side: -1, size: 1, price: 100, equity: 50, maxLeverage: 20 });
    expect(liq).toBeCloseTo(150 / 1.025, 6);
  });

  it("a fully collateralised long cannot be liquidated", () => {
    expect(liquidationPrice({ side: 1, size: 2, price: 100, equity: 200, maxLeverage: 20 })).toBe(0);
  });

  it("equityForLiquidationPrice inverts liquidationPrice", () => {
    for (const side of [1, -1] as const) {
      const target = side === 1 ? 60 : 140;
      const equity = equityForLiquidationPrice({ side, size: 3, price: 100, maxLeverage: 10 }, target);
      expect(liquidationPrice({ side, size: 3, price: 100, equity, maxLeverage: 10 })).toBeCloseTo(target, 8);
    }
  });

  it("picks the highest leverage that keeps the buffer", () => {
    expect(leverageForBuffer(1, 20, 0.45)).toBe(2);
    expect(leverageForBuffer(-1, 20, 0.45)).toBe(2);
    expect(leverageForBuffer(1, 20, 0.3)).toBe(3);
  });
});
