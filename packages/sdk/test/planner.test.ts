import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/network";
import { planHedge } from "../src/planner";
import { protectionRatio, runScenarios } from "../src/scenarios";
import { addPeriod, buildSchedule } from "../src/schedule";
import { market, marketsMap, NOW } from "./fixtures";

const cfg = defaultConfig("testnet", "0x000000000000000000000000000000000000beef");
const markets = marketsMap(
  market("xyz:BRENTOIL", 97.7),
  market("xyz:CL", 92.04, { szDecimals: 3 }),
  market("xyz:GOLD", 4290, { szDecimals: 4, maxLeverage: 25 }),
  market("xyz:JPY", 158, { szDecimals: 2, maxLeverage: 50, dayVolumeUsd: 3_000_000 }),
);

describe("planHedge", () => {
  it("sizes a monthly diesel hedge in barrels and schedules unwinds", () => {
    const plan = planHedge(
      {
        exposureId: "diesel",
        unitId: "L",
        quantity: 40_000,
        frequency: "monthly",
        periods: 6,
        direction: "buy",
        hedgeRatio: 0.75,
      },
      markets,
      { config: cfg, now: NOW },
    );
    expect(plan.side).toBe(1);
    expect(plan.totalUserQty).toBe(240_000);
    expect(plan.fullHedgeSize).toBeCloseTo(240_000 / 158.987294928, 6);
    expect(plan.size).toBe(1132.16);
    expect(plan.leverage).toBe(2);
    expect(plan.marginUsd).toBeCloseTo((1132.16 * 97.7) / 2, 6);
    expect(plan.liqDistance).toBeGreaterThan(0.45);
    expect(plan.schedule).toHaveLength(6);
    const unwound = plan.schedule.reduce((s, x) => s + x.reduceSize, 0);
    expect(unwound).toBeCloseTo(plan.size, 6);
    expect(plan.schedule.at(-1)!.remainingAfter).toBe(0);
    expect(plan.lockedPerUserUnit).toBeCloseTo(97.7 / 158.987294928, 6);
    expect(plan.warnings.some((w) => w.code === "basis")).toBe(true);
    expect(plan.warnings.some((w) => w.level === "blocker")).toBe(false);
  });

  it("shorts for producers who sell", () => {
    const plan = planHedge(
      { exposureId: "gold", unitId: "kg", quantity: 2, frequency: "quarterly", periods: 4, direction: "sell", hedgeRatio: 1 },
      markets,
      { config: cfg, now: NOW },
    );
    expect(plan.side).toBe(-1);
    expect(plan.fullHedgeSize).toBeCloseTo((8 * 1000) / 31.1034768, 6);
  });

  it("flips side and sizes by X/P² for inverse USD/JPY quotes", () => {
    const plan = planHedge(
      { exposureId: "jpy", unitId: "JPY", quantity: 10_000_000, frequency: "once", periods: 1, direction: "buy", hedgeRatio: 1 },
      markets,
      { config: cfg, now: NOW },
    );
    expect(plan.side).toBe(-1);
    expect(plan.fullHedgeSize).toBeCloseTo(1e7 / 158 ** 2, 6);
    expect(plan.exposureUsd).toBeCloseTo(1e7 / 158, 6);
    expect(plan.lockedPerUserUnit).toBeNull();
    expect(plan.warnings.some((w) => w.code === "thin-market")).toBe(true);
  });

  it("blocks hedges under the $10 minimum", () => {
    const plan = planHedge(
      { exposureId: "diesel", unitId: "L", quantity: 5, frequency: "once", periods: 1, direction: "buy", hedgeRatio: 1 },
      markets,
      { config: cfg, now: NOW },
    );
    expect(plan.warnings.some((w) => w.level === "blocker" && w.code === "too-small")).toBe(true);
  });

  it("charges longs for positive funding across the stepped-down schedule", () => {
    const m = marketsMap(market("xyz:BRENTOIL", 100, { fundingHourly: 0.00001 }));
    const plan = planHedge(
      { exposureId: "crude", unitId: "bbl", quantity: 100, frequency: "monthly", periods: 2, direction: "buy", hedgeRatio: 1 },
      m,
      { config: cfg, now: NOW },
    );
    expect(plan.costs.fundingUsd).toBeGreaterThan(0);
    // Full 200 bbl for month 1, then 100 bbl for month 2.
    const h1 = (plan.schedule[0]!.date - NOW) / 3.6e6;
    const h2 = (plan.schedule[1]!.date - plan.schedule[0]!.date) / 3.6e6;
    expect(plan.costs.fundingUsd).toBeCloseTo(200 * 100 * 0.00001 * h1 + 100 * 100 * 0.00001 * h2, 6);
    expect(plan.costs.builderFeesUsd).toBeCloseTo(2 * 200 * 100 * 0.0003, 6);
  });
});

describe("scenarios", () => {
  it("a 100% hedge offsets price moves up to rounding and costs", () => {
    const plan = planHedge(
      { exposureId: "crude", unitId: "bbl", quantity: 1000, frequency: "once", periods: 1, direction: "buy", hedgeRatio: 1 },
      markets,
      { config: cfg, now: NOW },
    );
    const up = runScenarios(plan, [0.2])[0]!;
    expect(up.unhedgedImpactUsd).toBeCloseTo(1000 * 97.7 * 0.2, 6);
    expect(up.hedgePnlUsd).toBeCloseTo(up.unhedgedImpactUsd, 6);
    expect(up.netImpactUsd).toBeCloseTo(plan.costs.totalUsd, 6);
    expect(protectionRatio(up)).toBeCloseTo(1, 6);
  });

  it("the yen hedge pays when the yen strengthens", () => {
    const plan = planHedge(
      { exposureId: "jpy", unitId: "JPY", quantity: 10_000_000, frequency: "once", periods: 1, direction: "buy", hedgeRatio: 1 },
      markets,
      { config: cfg, now: NOW },
    );
    const s = runScenarios(plan, [-0.1])[0]!; // USD/JPY falls 10% → yen bill costs more
    expect(s.unhedgedImpactUsd).toBeGreaterThan(0);
    expect(s.hedgePnlUsd).toBeGreaterThan(0);
    // First-order hedge: covers most of a 10% move (convexity leaves a small gap).
    expect(protectionRatio(s)).toBeGreaterThan(0.85);
  });

  it("flags moves that would breach liquidation", () => {
    const plan = planHedge(
      { exposureId: "crude", unitId: "bbl", quantity: 1000, frequency: "once", periods: 1, direction: "buy", hedgeRatio: 1, leverage: 5 },
      markets,
      { config: cfg, now: NOW },
    );
    const crash = runScenarios(plan, [-0.3])[0]!;
    expect(crash.breachesLiquidation).toBe(true);
    expect(crash.hedgePnlUsd).toBeCloseTo(-plan.marginUsd, 6);
  });
});

describe("schedule", () => {
  it("clamps month-end dates", () => {
    const jan31 = Date.UTC(2027, 0, 31);
    expect(new Date(addPeriod(jan31, "monthly")).toISOString().slice(0, 10)).toBe("2027-02-28");
  });

  it("absorbs lot rounding in the last step", () => {
    const steps = buildSchedule({
      size: 10,
      szDecimals: 2,
      userQtyPerPeriod: 1,
      frequency: "monthly",
      periods: 3,
      firstSettlement: NOW,
    });
    expect(steps.map((s) => s.reduceSize)).toEqual([3.33, 3.33, 3.34]);
    expect(steps.at(-1)!.remainingAfter).toBe(0);
  });
});
