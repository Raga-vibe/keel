# Keel

[![CI](https://github.com/Raga-vibe/keel/actions/workflows/ci.yml/badge.svg)](https://github.com/Raga-vibe/keel/actions/workflows/ci.yml)

**Plan for future business costs.** Keel turns a future invoice or scheduled purchase into a modeled hedge on Hyperliquid's 24/7 HIP-3 markets. For example, an importer owing €250,000 in 90 days can review a EUR/USD position sized to offset some currency movement, the USDC margin it needs, estimated costs, and planned close dates. A hedge does not set the supplier's price or remove risk: funding changes, collateral is required, and the benchmark may not match the exact invoice.

Built for the Colosseum Crypto World's Fair hackathon, Hyperliquid track.

**Try it:** [keel-seven-lilac.vercel.app](https://keel-seven-lilac.vercel.app). Paper mode needs no wallet and runs at live Hyperliquid prices. See [Watch mode](https://keel-seven-lilac.vercel.app/watch) for real accounts.

## What it does

1. **Describe the future cost** in business terms: amount, currency or commodity, and payment or purchase date.
2. **Review an estimated hedge plan**: Keel maps the cost to a benchmark (EUR/USD, Brent, gold, copper, and more), converts units, estimates position size, USDC margin, fees and funding, and shows price-move scenarios.
3. **Monitor and unwind**: the guardian watches liquidation risk and can close scheduled slices as purchases happen. The browser guardian runs while the app is open; 24/7 use requires the separate keeper.

Paper mode uses live market prices with simulated fills. The live order flow was verified on testnet and has not been used with real funds. Keel sends orders to the user's Hyperliquid account and does not hold funds.

**Watch mode** runs the same risk engine read-only on *any* Hyperliquid address: it shows each commodity/FX position's liquidation distance, what Keel's guardian would do, and the real-world exposure it's equivalent to (e.g. "protects sales of 2,081 kg of silver"). It can also find live accounts from Hyperliquid's public trade feed.

## Docs

- [Business plan](docs/BUSINESS_PLAN.md): problem, market, competition, go-to-market, revenue model, roadmap, risks.
- [How Keel hedges](docs/METHODOLOGY.md): unit conversion, sizing, liquidation math, costs, guardian policy, limitations.
- [Architecture](docs/ARCHITECTURE.md): components, hedge lifecycle, trust model, failure handling.
- [Hedge SDK guide](packages/sdk/README.md): use the engine in your own app, with runnable [examples](packages/sdk/examples).

## Repo layout

| Path | What |
|---|---|
| `packages/sdk` | `@keel/hedge-sdk`: open-source hedge engine (catalog, planner, margin math, scenarios, guardian, paper and live venues, reports). |
| `apps/web` | Next.js app: market board, hedge wizard, dashboard, simulation lab, watch mode. |
| `apps/keeper` | Node CLI: `plan` prints a hedge plan from live prices, `watch` reports on any account, `keeper` runs the guardian 24/7 with an agent key. |

## Run it

```bash
npm install
npm run dev          # web app on http://localhost:3000
npm test             # SDK unit tests
npm run plan -- diesel 40000 L monthly 6 buy 0.75
npm run watch -- --find           # accounts trading commodities right now
npm run watch -- 0xADDRESS        # read-only risk report for any account
```

Paper mode (the default) fills at live mainnet prices with simulated funds, so no wallet is needed. Live mode trades on Hyperliquid testnet or mainnet through a browser-generated **agent key**. The user approves that key once; it can trade and move margin but can never withdraw.

### Builder fee

Set `NEXT_PUBLIC_KEEL_BUILDER` (web) and `KEEL_BUILDER` (keeper) to the address that should receive Keel's 0.03% builder fee. Hyperliquid requires the builder address to hold at least 100 USDC in perps.

### Keeper

```bash
KEEL_NETWORK=testnet KEEL_USER=0x... KEEL_AGENT_KEY=0x... KEEL_HEDGES=./hedges.json npm run keeper -- --execute
```

Export `hedges.json` from the dashboard. Without `--execute` the keeper runs as a dry run.

## Key design choices

- **Isolated margin, low leverage.** Auto leverage keeps liquidation at least 45% away (30% for FX) and never exceeds 3x.
- **Median funding.** Short squeezes create funding spikes 50–100× normal, so plans use the median rate, not the mean.
- **Inverse FX.** USD/JPY is quoted in yen per dollar, so a yen bill of X is hedged with X/P² units short (first-order exact; tested).
- **Basis honesty.** Diesel = crude + refining margin + taxes. Keel says plainly that it hedges the crude component.

## Team

Built by **RagaCrypt** · [X @RagaCrypt](https://x.com/RagaCrypt) · [ragafolio.space](https://ragafolio.space)

## License

MIT
