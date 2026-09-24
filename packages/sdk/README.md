# @keel/hedge-sdk

Open-source engine for hedging real-world costs — fuel, metals, foreign-currency invoices — with Hyperliquid HIP-3 perpetuals. It powers the Keel web app and keeper, and is designed to be dropped into any other app: a treasury tool, an ERP plugin, a wallet, or an agent.

- **Speaks business units.** "40,000 litres of diesel a month" in, "long 1,132.16 bbl Brent at 2x" out.
- **Risk-first.** Low-leverage isolated positions, liquidation math that matches Hyperliquid's, stress tests, and a guardian that keeps hedges alive.
- **Venue-agnostic.** The same plan runs against live Hyperliquid (via an agent key) or a paper venue that fills at live prices.
- **Pure core.** Planning, scenarios and guardian decisions are pure functions over data — easy to test, audit and reuse. 33 unit tests.

Built on [`@nktkas/hyperliquid`](https://github.com/nktkas/hyperliquid) and [viem](https://viem.sh).

## Install

The package is TypeScript source, consumed directly by bundlers and runtimes that understand TS (Next.js `transpilePackages`, Vite, tsx, Bun). Inside this monorepo it is linked as a workspace:

```jsonc
// package.json
"dependencies": { "@keel/hedge-sdk": "0.1.0" }
```

## Quick start

Runnable versions of these snippets live in [`examples/`](examples) (`npx tsx examples/plan.ts`).

### 1. Plan a hedge from live prices

```ts
import { catalogCoins, defaultConfig, loadMarkets, makeInfoClient, planHedge, runScenarios } from "@keel/hedge-sdk";

const info = makeInfoClient("mainnet");
const config = defaultConfig("mainnet"); // pass a builder address as 2nd arg to earn the builder fee
const markets = await loadMarkets(info, "xyz", catalogCoins());

const plan = planHedge(
  {
    exposureId: "diesel", // see EXPOSURES for the catalog
    unitId: "L",
    quantity: 40_000, // per period
    frequency: "monthly",
    periods: 6,
    direction: "buy", // the business pays for diesel → hurt when prices rise
    hedgeRatio: 0.75,
  },
  markets,
  { config },
);

plan.side; // 1 (long)
plan.sizeStr; // "1132.16" bbl of xyz:BRENTOIL
plan.leverage; // 2 (auto: keeps liquidation ≥45% away)
plan.lockedPerUserUnit; // ≈ 0.618 USD per litre — the crude component
plan.costs; // fees, builder fee, funding (median), total
plan.schedule; // 6 unwind steps, one per purchase
runScenarios(plan); // ±10/20/30% moves with and without the hedge
```

### 2. Execute on the paper venue (no funds needed)

```ts
import { memoryStore, PaperVenue, recordFromPlan } from "@keel/hedge-sdk";

const venue = new PaperVenue({
  user: "0x…",
  config,
  store: memoryStore(), // or localStorage-backed
  markets: () => loadMarkets(info, "xyz"), // live prices
});
const fill = await venue.openHedge(plan);
const record = recordFromPlan(plan, fill, "paper", "mainnet");
```

### 3. Execute live through an agent key

The user signs three one-time approvals with their own wallet; after that an **agent key** trades on their behalf. Hyperliquid agent keys can place orders and move margin but can never withdraw or transfer funds.

```ts
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { approveKeelAgent, approveKeelBuilderFee, enableUnifiedAccount, LiveVenue } from "@keel/hedge-sdk";

// once, signed by the user's wallet (viem WalletClient, ethers signer, …)
const main = new ExchangeClient({ transport: new HttpTransport(), wallet: userWallet });
const agentKey = generatePrivateKey();
await enableUnifiedAccount(main, user); // one USDC balance margins HIP-3 markets
await approveKeelAgent(main, privateKeyToAccount(agentKey).address);
await approveKeelBuilderFee(main, config); // only if config.builderAddress is set

// from then on, the agent trades
const exchange = new ExchangeClient({ transport: new HttpTransport(), wallet: privateKeyToAccount(agentKey) });
const venue = new LiveVenue({ config, info, exchange, user });
await venue.openHedge(plan, "market"); // IOC with slippage cap; "limit" rests at the oracle price
```

### 4. Keep hedges alive with the guardian

```ts
import { evaluateGuardian, runGuardianActions } from "@keel/hedge-sdk";

const account = await venue.getAccount();
const actions = evaluateGuardian({ account, hedges }); // pure: decides, doesn't act
const { hedges: updated, results } = await runGuardianActions(venue, actions, hedges);
```

Actions are `add-margin`, `reduce`, `settle` (close the slice for a purchase date that has arrived) and `alert`. Run it on a timer — the web app does it in the browser, [`apps/keeper`](../../apps/keeper) does it 24/7.

### 5. Assess any account (read-only)

```ts
import { assessAccount, findActiveAccounts, readAccount } from "@keel/hedge-sdk";

const [someone] = await findActiveAccounts(info, ["xyz:GOLD", "xyz:BRENTOIL"], 1);
const report = assessAccount(await readAccount(info, someone.address, "xyz"), markets);
report.positions[0].recommendation; // "Liquidation is 23.3% away. Keel's guardian would add $695,854…"
report.positions[0].equivalents[0]; // { label: "Silver", direction: "sell", qty: 2081, unitLabel: "kilograms" }
```

## API reference

| Module | Exports | Purpose |
|---|---|---|
| `catalog` | `EXPOSURES`, `getExposure`, `getUnit`, `getInstrument`, `catalogCoins` | Real-world exposures, their units and the perps that hedge them. |
| `network` | `defaultConfig`, `builderFeeFraction`, `builderFeePercentString` | Network, dex, builder fee, fee estimates, slippage. |
| `markets` | `makeInfoClient`, `loadMarkets`, `typicalFunding`, `loadCandles`, `annualisedVol`, `getDexIndex` | Live market snapshots with HIP-3 asset ids. |
| `margin` | `liquidationPrice`, `equityForLiquidationPrice`, `distanceToLiquidation`, `leverageForBuffer`, `maintenanceRate` | Isolated-margin math matching Hyperliquid. |
| `planner` | `planHedge`, `MIN_ORDER_USD`, `MAX_AUTO_LEVERAGE` | Exposure → hedge plan with costs, schedule and warnings. |
| `scenarios` | `runScenarios`, `protectionRatio` | Stress tests with and without the hedge. |
| `schedule` | `buildSchedule`, `addPeriod`, `floorToLot` | Unwind schedule following purchase dates. |
| `venue` | `Venue`, `HedgePosition`, `AccountState` | Interface every execution venue implements. |
| `live` | `LiveVenue`, `readAccount` | Hyperliquid execution via agent key; account reader. |
| `paper` | `PaperVenue`, `memoryStore` | Simulated fills at live prices with fees and funding. |
| `records` | `recordFromPlan`, `applySettlement`, `openSize`, `dueSteps`, `nextStep` | The hedge book: one record per business hedge. |
| `guardian` | `evaluateGuardian`, `runGuardianActions`, `DEFAULT_POLICY` | Margin top-ups, scheduled settlements, reconciliation. |
| `assess` | `assessPosition`, `assessAccount`, `exposureEquivalents`, `findActiveAccounts` | Read-only risk reports for any account. |
| `report` | `buildReport`, `reportToCsv` | Accountant-friendly reporting. |
| `onboarding` | `getOnboardingStatus`, `enableUnifiedAccount`, `approveKeelAgent`, `approveKeelBuilderFee` | One-time wallet approvals. |

See [`docs/METHODOLOGY.md`](../../docs/METHODOLOGY.md) for the math and [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for how the pieces fit.

## Tests

```bash
npm test          # from the repo root, or `npx vitest run` here
```

## License

MIT
