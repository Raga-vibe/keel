/**
 * Open a paper hedge at live prices, crash the price, and let the guardian react.
 *   npx tsx examples/paper.ts
 */
import {
  catalogCoins,
  defaultConfig,
  evaluateGuardian,
  loadMarkets,
  makeInfoClient,
  memoryStore,
  PaperVenue,
  planHedge,
  recordFromPlan,
  runGuardianActions,
  type MarketSnapshot,
} from "../src";

const config = defaultConfig("mainnet");
const live = await loadMarkets(makeInfoClient("mainnet"), "xyz", catalogCoins());

// A price override lets us simulate a crash on top of real market data.
let shock = 0;
const markets = async () => {
  const m = new Map<string, MarketSnapshot>();
  for (const [coin, s] of live) {
    const f = 1 + shock;
    m.set(coin, { ...s, markPx: s.markPx * f, midPx: s.midPx * f, oraclePx: s.oraclePx * f });
  }
  return m;
};

const venue = new PaperVenue({
  user: "0x00000000000000000000000000000000000000d0",
  config,
  store: memoryStore(),
  markets,
});

const plan = planHedge(
  // A jeweller buying 200 g of gold a month for 3 months (~$80k of gold).
  { exposureId: "gold", unitId: "g", quantity: 200, frequency: "monthly", periods: 3, direction: "buy", hedgeRatio: 1 },
  await markets(),
  { config },
);
const fill = await venue.openHedge(plan);
if (fill.status === "error") throw new Error(fill.message);
let hedges = [recordFromPlan(plan, fill, "paper", "mainnet")];
console.log(`Opened: long ${fill.filledSize} oz gold at ${fill.avgPx.toFixed(1)}`);

shock = -0.4; // gold falls 40%
const account = await venue.getAccount();
const actions = evaluateGuardian({ account, hedges });
for (const a of actions) console.log(`Guardian → ${a.kind}: ${"reason" in a ? a.reason : a.message}`);

const run = await runGuardianActions(venue, actions, hedges);
hedges = run.hedges;
const after = await venue.getAccount();
const p = after.positions[0]!;
console.log(`After: equity $${p.equityUsd.toFixed(0)}, liquidation at ${p.liqPx.toFixed(1)} (mark ${p.markPx.toFixed(1)})`);
