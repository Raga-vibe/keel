/**
 * Print a hedge plan from live Hyperliquid prices.
 *
 *   npm run plan -- <exposure> <qty> <unit> <frequency> <periods> <buy|sell> [ratio] [network]
 *   npm run plan -- diesel 40000 L monthly 6 buy 0.75
 */
import {
  typicalFunding,
  catalogCoins,
  defaultConfig,
  EXPOSURES,
  loadMarkets,
  makeInfoClient,
  planHedge,
  runScenarios,
  type Direction,
  type Frequency,
  type NetworkId,
} from "@keel/hedge-sdk";

const [exposureId, qty, unitId, frequency, periods, direction, ratio = "0.75", network = "mainnet"] =
  process.argv.slice(2);

if (!exposureId || !qty || !unitId || !frequency || !periods || !direction) {
  console.log("usage: npm run plan -- <exposure> <qty> <unit> <frequency> <periods> <buy|sell> [ratio] [network]");
  console.log("exposures:", EXPOSURES.map((e) => `${e.id} (${e.units.map((u) => u.id).join("/")})`).join(", "));
  process.exit(1);
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

const net = network as NetworkId;
const info = makeInfoClient(net);
const markets = await loadMarkets(info, "xyz", catalogCoins());
const cfg = defaultConfig(net, process.env.KEEL_BUILDER as `0x${string}` | undefined);

const input = {
  exposureId,
  unitId,
  quantity: Number(qty),
  frequency: frequency as Frequency,
  periods: Number(periods),
  direction: direction as Direction,
  hedgeRatio: Number(ratio),
};
const draft = planHedge(input, markets, { config: cfg });
const avg = await typicalFunding(info, draft.market.coin).catch(() => undefined);
if (avg !== undefined) markets.set(draft.market.coin, { ...draft.market, fundingHourlyTypical: avg });
const plan = planHedge(input, markets, { config: cfg });

console.log(`\n${plan.exposure.label}: ${input.direction} ${input.quantity} ${plan.unit.label} ${input.frequency} × ${plan.schedule.length}`);
console.log(`Hedge with   ${plan.side === 1 ? "LONG" : "SHORT"} ${plan.sizeStr} ${plan.instrument.unit} of ${plan.market.coin} @ ${plan.refPx}`);
console.log(`Exposure     ${usd(plan.exposureUsd)}   hedged ${usd(plan.notionalUsd)} (${pct(input.hedgeRatio)})`);
console.log(`Margin       ${usd(plan.marginUsd)} at ${plan.leverage}x, liquidation ${plan.liqPx.toFixed(4)} (${pct(plan.liqDistance)} away)`);
if (plan.lockedPerUserUnit !== null) {
  console.log(`Locked       ${plan.lockedPerUserUnit.toFixed(4)} USD per ${plan.unit.id} (benchmark component)`);
}
console.log(
  `Costs        fees ${usd(plan.costs.tradingFeesUsd)} + builder ${usd(plan.costs.builderFeesUsd)} + funding ${usd(plan.costs.fundingUsd)} = ${usd(plan.costs.totalUsd)} (${pct(plan.costs.totalPctOfHedged)})`,
);
console.log(`Horizon      ${plan.horizonDays.toFixed(0)} days`);
console.log("\nSchedule");
for (const s of plan.schedule) {
  console.log(`  ${new Date(s.date).toISOString().slice(0, 10)}  close ${s.reduceSize}  → ${s.remainingAfter} left`);
}
console.log("\nScenarios (impact on the business, + = worse)");
for (const s of runScenarios(plan)) {
  console.log(
    `  ${(s.shock >= 0 ? "+" : "") + (s.shock * 100).toFixed(0)}%`.padEnd(8),
    `unhedged ${usd(s.unhedgedImpactUsd)}`.padEnd(24),
    `hedge ${usd(s.hedgePnlUsd)}`.padEnd(22),
    `net ${usd(s.netImpactUsd)}${s.breachesLiquidation ? "  (liquidation zone)" : ""}`,
  );
}
if (plan.warnings.length) {
  console.log("\nNotes");
  for (const w of plan.warnings) console.log(`  [${w.level}] ${w.message}`);
}
