/**
 * Plan a hedge from live Hyperliquid prices.
 *   npx tsx examples/plan.ts
 */
import {
  catalogCoins,
  defaultConfig,
  loadMarkets,
  makeInfoClient,
  planHedge,
  runScenarios,
  typicalFunding,
} from "../src";

const info = makeInfoClient("mainnet");
const markets = await loadMarkets(info, "xyz", catalogCoins());

// Use the median funding of the last 14 days for the cost estimate.
const brent = markets.get("xyz:BRENTOIL")!;
markets.set(brent.coin, { ...brent, fundingHourlyTypical: await typicalFunding(info, brent.coin) });

const plan = planHedge(
  {
    exposureId: "diesel", // what the business buys
    unitId: "L", // in its own units
    quantity: 40_000, // per period
    frequency: "monthly",
    periods: 6,
    direction: "buy", // hurt when prices rise
    hedgeRatio: 0.75, // protect 75%
  },
  markets,
  { config: defaultConfig("mainnet") },
);

console.log(`${plan.side === 1 ? "Long" : "Short"} ${plan.sizeStr} ${plan.instrument.unit} ${plan.market.coin} at ${plan.leverage}x`);
console.log(`Margin $${plan.marginUsd.toFixed(0)}, liquidation ${(plan.liqDistance * 100).toFixed(0)}% away`);
console.log(`Locks $${plan.lockedPerUserUnit!.toFixed(4)} per litre (crude component)`);
console.log(`All-in cost $${plan.costs.totalUsd.toFixed(0)} (${(plan.costs.totalPctOfHedged * 100).toFixed(2)}%)`);

for (const s of runScenarios(plan, [-0.2, 0.2])) {
  console.log(
    `Oil ${s.shock > 0 ? "+" : ""}${s.shock * 100}%: unhedged ${s.unhedgedImpactUsd.toFixed(0)}, with Keel ${s.netImpactUsd.toFixed(0)}`,
  );
}
