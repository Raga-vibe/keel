import { describe, expect, it } from "vitest";
import { evaluateGuardian, runGuardianActions } from "../src/guardian";
import { distanceToLiquidation, liquidationPrice } from "../src/margin";
import { defaultConfig } from "../src/network";
import { memoryStore, PaperVenue } from "../src/paper";
import { planHedge } from "../src/planner";
import { openSize, recordFromPlan } from "../src/records";
import type { AccountState, HedgePosition } from "../src/venue";
import { market, marketsMap, NOW } from "./fixtures";

const cfg = defaultConfig("testnet");
const USER = "0x00000000000000000000000000000000000000aa" as const;

function position(over: Partial<HedgePosition>): HedgePosition {
  const base = { coin: "xyz:CL", assetId: 1, side: 1 as const, size: 100, entryPx: 100, markPx: 100, maxLeverage: 20, leverage: 2 };
  const p = { ...base, ...over };
  const equity = over.equityUsd ?? 5000;
  return {
    ...p,
    equityUsd: equity,
    unrealizedPnlUsd: 0,
    liqPx: liquidationPrice({ side: p.side, size: p.size, price: p.markPx, equity, maxLeverage: p.maxLeverage }),
    fundingSinceOpenUsd: 0,
  };
}

function crudeHedge(periods = 3) {
  const plan = planHedge(
    {
      exposureId: "crude",
      unitId: "bbl",
      instrumentCoin: "xyz:CL",
      quantity: 100 / periods,
      frequency: "monthly",
      periods,
      direction: "buy",
      hedgeRatio: 1,
    },
    marketsMap(market("xyz:CL", 100)),
    { config: cfg, now: NOW },
  );
  return { plan, rec: recordFromPlan(plan, { status: "filled", filledSize: plan.size, avgPx: 100 }, "paper", "testnet", NOW) };
}

describe("guardian", () => {
  it("tops up margin to the target distance when liquidation gets close", () => {
    const { rec } = crudeHedge(1);
    // Oil fell 30%: equity $1,000 on 100 bbl leaves liquidation ~12% away.
    const pos = position({ size: rec.size, markPx: 70, equityUsd: 1000 });
    expect(distanceToLiquidation(1, 70, pos.liqPx)).toBeLessThan(0.25);
    const account: AccountState = { user: USER, availableUsd: 1_000_000, positions: [pos], updatedAt: NOW };
    const actions = evaluateGuardian({ account, hedges: [rec], now: NOW });
    const add = actions.find((a) => a.kind === "add-margin");
    expect(add).toBeDefined();
    if (add?.kind !== "add-margin") return;
    const equity = pos.equityUsd + add.amountUsd;
    const liq = liquidationPrice({ side: 1, size: pos.size, price: 70, equity, maxLeverage: 20 });
    expect(distanceToLiquidation(1, 70, liq)).toBeCloseTo(0.4, 2);
  });

  it("shrinks the hedge when it is critical and there is no collateral", () => {
    const { rec } = crudeHedge(1);
    const pos = position({ size: rec.size, markPx: 70, equityUsd: 200 });
    const account: AccountState = { user: USER, availableUsd: 0, positions: [pos], updatedAt: NOW };
    const actions = evaluateGuardian({ account, hedges: [rec], now: NOW });
    expect(actions.some((a) => a.kind === "reduce")).toBe(true);
  });

  it("settles slices when their purchase date arrives", () => {
    const { rec } = crudeHedge(3);
    const later = rec.schedule[1]!.date + 1;
    const pos = position({ size: rec.size, equityUsd: 5000 });
    const account: AccountState = { user: USER, availableUsd: 0, positions: [pos], updatedAt: later };
    const actions = evaluateGuardian({ account, hedges: [rec], now: later });
    const settle = actions.find((a) => a.kind === "settle");
    expect(settle?.kind).toBe("settle");
    if (settle?.kind !== "settle") return;
    expect(settle.steps.map((s) => s.index)).toEqual([0, 1]);
    expect(settle.size).toBeCloseTo(rec.schedule[0]!.reduceSize + rec.schedule[1]!.reduceSize, 6);
  });

  it("alerts when the position is missing", () => {
    const { rec } = crudeHedge(1);
    const account: AccountState = { user: USER, availableUsd: 0, positions: [], updatedAt: NOW };
    const actions = evaluateGuardian({ account, hedges: [rec], now: NOW });
    expect(actions[0]).toMatchObject({ kind: "alert", level: "critical" });
  });
});

describe("paper venue end to end", () => {
  it("opens, settles on schedule and books realised PnL", async () => {
    let px = 100;
    let clock = NOW;
    const venue = new PaperVenue({
      user: USER,
      config: cfg,
      store: memoryStore(),
      markets: async () => marketsMap(market("xyz:CL", px)),
      now: () => clock,
    });
    const { plan } = crudeHedge(2);
    const fill = await venue.openHedge(plan);
    expect(fill.status).toBe("filled");
    let rec = recordFromPlan(plan, fill, "paper", "testnet", NOW);

    // Oil rallies 20% before the first purchase date.
    px = 120;
    clock = plan.schedule[0]!.date + 1000;
    const account = await venue.getAccount();
    const actions = evaluateGuardian({ account, hedges: [rec], now: clock });
    const run = await runGuardianActions(venue, actions, [rec], clock);
    rec = run.hedges[0]!;

    expect(rec.settled).toHaveLength(1);
    expect(rec.settled[0]!.pnlUsd).toBeGreaterThan(0.19 * 100 * rec.settled[0]!.size);
    expect(openSize(rec)).toBeCloseTo(plan.schedule[1]!.reduceSize, 6);
    const after = await venue.getAccount();
    expect(after.positions[0]!.size).toBeCloseTo(openSize(rec), 6);
  });
});
