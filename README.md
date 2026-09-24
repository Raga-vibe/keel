# Keel

**Price certainty for real businesses.** Keel lets a fleet operator lock in diesel costs, a jeweller lock in gold, or an importer lock in a euro invoice, using Hyperliquid's 24/7 HIP-3 commodity and FX perpetuals. There's no bank, no futures account, and no custody: hedges live in the user's own Hyperliquid account.

Built for the Colosseum Crypto World's Fair hackathon, Hyperliquid track.

## What it does

1. **Describe the exposure** in business terms: "we buy 40,000 L of diesel a month for 6 months".
2. **Keel plans the hedge**: it maps the exposure onto the right benchmark (Brent, WTI, gold, copper, EUR/USD, …), converts units, sizes a low-leverage isolated position, estimates fees and funding (median of the last 14 days), stress-tests ±30% moves, and builds an unwind schedule that follows the purchases.
3. **The guardian runs it**: it tops up margin before liquidation gets close, closes each slice when its purchase date arrives, reconciles positions against the hedge book, and exports an accountant-friendly CSV.

**Watch mode** runs the same risk engine read-only on *any* Hyperliquid address: it shows each commodity/FX position's liquidation distance, what Keel's guardian would do, and the real-world exposure it's equivalent to (e.g. "protects sales of 2,081 kg of silver"). It can also find live accounts from Hyperliquid's public trade feed.

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

## License

MIT
