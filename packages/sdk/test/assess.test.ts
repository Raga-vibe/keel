import { describe, expect, it } from "vitest";
import { assessAccount, assessPosition, exposureEquivalents } from "../src/assess";
import { evaluateGuardian } from "../src/guardian";
import { distanceToLiquidation, liquidationPrice } from "../src/margin";
import type { HedgePosition } from "../src/venue";
import { market, marketsMap, NOW } from "./fixtures";

function pos(over: Partial<HedgePosition> & { equityUsd: number }): HedgePosition {
  const p = {
    coin: "xyz:BRENTOIL",
    assetId: 1,
    side: 1 as const,
    size: 1000,
    entryPx: 100,
    markPx: 100,
    leverage: 2,
    marginMode: "isolated" as const,
    maxLeverage: 20,
    unrealizedPnlUsd: 0,
    fundingSinceOpenUsd: 0,
    ...over,
  };
  return {
    ...p,
    liqPx: over.liqPx ?? liquidationPrice({ side: p.side, size: p.size, price: p.markPx, equity: p.equityUsd, maxLeverage: p.maxLeverage }),
  };
}

describe("exposureEquivalents", () => {
  it("expresses long Brent as litres of fuel purchases", () => {
    const eq = exposureEquivalents("xyz:BRENTOIL", 1, 1000, 100);
    const diesel = eq.find((e) => e.exposureId === "diesel")!;
    expect(diesel.direction).toBe("buy");
    expect(diesel.unitLabel).toBe("litres");
    expect(diesel.qty).toBeCloseTo(158_987.29, 1);
  });

  it("describes short oil as crude production first", () => {
    const [first] = exposureEquivalents("xyz:BRENTOIL", -1, 1000, 100);
    expect(first!.exposureId).toBe("crude");
    expect(first!.unitLabel).toBe("barrels");
  });

  it("uses the largest sensible unit for metals", () => {
    const [gold] = exposureEquivalents("xyz:GOLD", -1, 985, 4290);
    expect(gold!.direction).toBe("sell");
    expect(gold!.unitLabel).toBe("kilograms");
    expect(gold!.qty).toBeCloseTo((985 * 31.1034768) / 1000, 3);
  });

  it("converts USD/JPY size back into yen, with the inverse direction", () => {
    const [jpy] = exposureEquivalents("xyz:JPY", -1, 400, 158);
    expect(jpy!.direction).toBe("buy"); // short USD/JPY protects someone paying yen
    expect(jpy!.qty).toBeCloseTo(400 * 158 * 158, 3);
  });
});

describe("assessPosition", () => {
  it("computes the top-up that restores the target buffer", () => {
    // $5k equity on 1,000 bbl at $70 → liquidation at ~$66.7, under 5% away.
    const a = assessPosition(pos({ markPx: 70, equityUsd: 5_000, size: 1000 }));
    expect(a.status).toBe("critical");
    const liq = liquidationPrice({ side: 1, size: 1000, price: 70, equity: 5_000 + a.topUpUsd!, maxLeverage: 20 });
    expect(distanceToLiquidation(1, 70, liq)).toBeCloseTo(0.4, 6);
  });

  it("does not suggest isolated top-ups for cross margin", () => {
    const a = assessPosition(pos({ marginMode: "cross", equityUsd: 5_000, liqPx: 85 }));
    expect(a.status).toBe("watch");
    expect(a.topUpUsd).toBeNull();
    expect(a.recommendation).toMatch(/cross-margin/);
  });

  it("recognises fully collateralised longs", () => {
    const a = assessPosition(pos({ equityUsd: 100_000, liqPx: 0 }));
    expect(a.status).toBe("no-liquidation");
  });

  it("reports carry from the position's side", () => {
    const m = market("xyz:BRENTOIL", 100, { fundingHourly: 0.00001 });
    expect(assessPosition(pos({ equityUsd: 50_000 }), m).carryApr).toBeCloseTo(0.0876, 4);
    expect(assessPosition(pos({ side: -1, equityUsd: 50_000 }), m).carryApr).toBeCloseTo(-0.0876, 4);
  });

  it("sorts catalog positions first and counts those at risk", () => {
    const account = {
      user: "0x00000000000000000000000000000000000000aa" as const,
      availableUsd: 0,
      positions: [
        pos({ coin: "xyz:NVDA", equityUsd: 1_000_000, size: 10_000 }),
        pos({ markPx: 70, equityUsd: 10_000 }),
      ],
      updatedAt: NOW,
    };
    const r = assessAccount(account, marketsMap());
    expect(r.positions[0]!.position.coin).toBe("xyz:BRENTOIL");
    expect(r.positions[1]!.inCatalog).toBe(false);
    expect(r.atRisk).toBe(1);
  });
});

describe("guardian and cross margin", () => {
  it("alerts instead of adding isolated margin", () => {
    const p = pos({ coin: "xyz:CL", marginMode: "cross", equityUsd: 5_000, liqPx: 90, size: 100 });
    const actions = evaluateGuardian({
      account: { user: "0x00000000000000000000000000000000000000aa", availableUsd: 1e6, positions: [p], updatedAt: NOW },
      hedges: [
        {
          id: "h1",
          label: "t",
          createdAt: NOW,
          venue: "live",
          network: "testnet",
          input: { exposureId: "crude", unitId: "bbl", quantity: 100, frequency: "once", periods: 1, direction: "buy", hedgeRatio: 1 },
          exposureLabel: "Crude oil",
          unitLabel: "barrels",
          toInstrument: 1,
          inverseQuote: false,
          coin: "xyz:CL",
          instrumentUnit: "bbl",
          side: 1,
          size: 100,
          entryPx: 100,
          leverage: 2,
          lockedPerUserUnit: 100,
          schedule: [{ index: 0, date: NOW + 1e9, userQty: 100, reduceSize: 100, remainingAfter: 0 }],
          settled: [],
          status: "open",
          events: [],
        },
      ],
      now: NOW,
    });
    expect(actions.some((a) => a.kind === "add-margin")).toBe(false);
    expect(actions.some((a) => a.kind === "alert" && a.message.includes("cross-margined"))).toBe(true);
  });
});

describe("far-away liquidation", () => {
  it("caps the wording for over-collateralised positions", () => {
    const a = assessPosition(pos({ side: -1, marginMode: "cross", equityUsd: 50_000, liqPx: 15_000, markPx: 94 }));
    expect(a.status).toBe("healthy");
    expect(a.recommendation).toBe("Liquidation is more than 100% away. Nothing to do.");
  });
});
