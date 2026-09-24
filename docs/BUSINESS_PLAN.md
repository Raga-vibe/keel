# Keel: Business Plan

> **Keel lets any business lock in what it pays for fuel, metals and foreign currency, in a few clicks, with no bank and no futures account. It turns Hyperliquid's 24/7 commodity and FX markets into a price lock.**

Live product: [keel-seven-lilac.vercel.app](https://keel-seven-lilac.vercel.app) · Code: [github.com/Raga-vibe/keel](https://github.com/Raga-vibe/keel)

---

## 1. The problem

Large companies protect their margins with hedging desks, futures accounts and bank credit lines. Small businesses carry the same price risk with none of those tools.

**Fuel.** Fuel is about 21% of what it costs to run a truck in the US: $0.482 of $2.336 per mile in 2025 [1]. Yet **91.5% of US carriers run 10 or fewer trucks** [2]. The standard hedge doesn't fit them:

- One CME diesel (ULSD) futures contract is **42,000 gallons**, physically delivered, with monthly expiries [3].
- A 5-truck fleet running 100,000 miles a truck at about 6.5 mpg burns roughly **77,000 gallons a year**. That's under two contracts for the whole year, so it can't be matched to monthly purchases.
- Hedging it also means opening a futures brokerage account, managing margin calls and rolling expiring contracts.

**Metals.** Jewellers bought 1,542 tonnes of gold in 2025, worth a record **$172 billion** [4]. A jeweller quotes a fixed price for a custom piece, then buys the metal weeks later at whatever it costs then.

**Foreign currency.** Survey evidence across countries shows most exporting SMEs use **no formal hedging at all**. One study found only **12%** of foreign-currency contracts hedged [5]. A Kantox study found more than a third of UK SMEs didn't know what their bank charged them to hedge [6].

**The outcome.** SMEs are about **90% of businesses and over 50% of jobs worldwide** [7], and they absorb commodity and currency shocks straight into their margins.

## 2. Why now

Until recently, no venue offered small-lot, always-on, non-custodial hedging of real-world prices. **Hyperliquid's HIP-3** changed that: builder-deployed perpetual markets on commodities, indices and FX, running 24/7 on the same engine as Hyperliquid's crypto perps.

Measured live on 24 Sep 2026:

| Hyperliquid HIP-3 "xyz" exchange | Value |
|---|---|
| Listed markets | 109 |
| 24-hour volume, all markets | **$2.2B** |
| Open interest, all markets | **$3.9B** |
| 24-hour volume on the markets Keel uses (Brent, WTI, gas, gold, silver, copper, PGMs, EUR, GBP, JPY) | **$522M** |
| Open interest on those markets | **$929M** |

For hedging, perps beat futures on every point that matters to a small business:

- **No expiry**, so nothing to roll.
- **Tiny lot sizes** (0.01 barrel of Brent), so a hedge can match monthly purchases exactly.
- **24/7 trading.**
- **Self-custody:** funds stay in the business's own account.

**The business model is proven.** Hyperliquid's builder codes let apps earn a fee on the trades they route. Builders have earned over **$40M** since launch, and Phantom alone has earned **$20.6M** [8].

## 3. The product

Keel is live, open source and usable today in paper mode.

1. **Describe the exposure in business terms.** For example: "We buy 40,000 L of diesel a month for 6 months." Keel supports 13 exposures (diesel, petrol, jet fuel, crude, natural gas, gold, silver, platinum, palladium, copper, EUR, GBP, JPY) in the units businesses actually use.
2. **Keel builds the hedge.** It:
   - picks the benchmark and converts the units;
   - sizes a low-leverage isolated position, keeping liquidation at least 45% away;
   - estimates all-in costs using median funding, not spike-distorted averages;
   - stress-tests ±30% price moves;
   - builds an unwind schedule that follows the purchase dates.
3. **The guardian runs it.** It tops up margin before liquidation risk grows, closes each slice when its purchase date arrives, and reconciles against the exchange. It exports an accountant-ready CSV.
4. **Watch mode** runs the same risk engine read-only on *any* Hyperliquid account. It's useful for advisers, accountants and lead generation.

**Trust model.** The business signs three one-time approvals. After that, a Keel *agent key* can trade and move margin but **can never withdraw funds**, and Hyperliquid enforces that. Keel never takes custody and never takes the other side of a trade.

**Worked example (live prices, 24 Sep 2026).** A fleet hedges 75% of 240,000 L of diesel over six months:

| Item | Result |
|---|---|
| Position | Long 1,132 barrels of Brent at 2x |
| Price locked | About $0.62 per litre (crude component) |
| All-in cost | **1.8%** over six months |
| If oil jumps 20% | Unhedged: **+$29.7K** extra cost. Hedged: about **+$9.4K**, costs included |

## 4. Competition

| | Bank forwards / swaps | CME futures via a broker | FX fintechs (Kantox, Bound) | Crypto trading apps | **Keel** |
|---|---|---|---|---|---|
| Built for small businesses | Rarely; credit lines needed | No; 42,000-gal contracts | Yes | No; built for traders | **Yes** |
| Commodities | Large clients only | Yes | No | Yes, as speculation | **Yes** |
| FX | Yes | Yes | Yes | Some | **Yes** |
| Works in business units and schedules | Partly | No | Yes (FX) | No | **Yes** |
| Account opening | Weeks, with a credit check | Days, via a broker | Days | Minutes | **Minutes** |
| Custody | Bank | Broker | Provider | Self or exchange | **Self-custody** |
| Automatic margin management | n/a | Margin calls | n/a | No | **Guardian** |
| Transparent pricing | Often opaque [6] | Yes | Yes | Yes | **Yes, shown before locking** |

**Keel's edge.** Consumer crypto apps (Phantom, MetaMask, Rabby) already route billions to Hyperliquid, but they sell speculation to traders. Keel sells **protection to businesses**. That's a different customer, a different product and a different reason to stay: hedges are recurring, not one-off trades.

## 5. Customers and go-to-market

**Beachhead: businesses that already hold stablecoins.** Crypto-native companies, and importers and exporters who settle trade in USDC or USDT, are especially common in emerging markets where bank hedging is scarce or expensive. They can fund a hedge in minutes, and FX and fuel shocks hit them hardest.

Target segments, in order:

1. **Fuel-intensive small businesses:** fleets, logistics, delivery, construction, farms, generator-dependent businesses.
2. **Metal buyers:** jewellers, electronics and cable makers, electricians, HVAC installers.
3. **Importers with EUR, GBP or JPY invoices.**

**Distribution:**

- **Embedded partners.** Stablecoin payment and treasury platforms, fuel-card providers and B2B neobanks add hedging in-app through the open-source SDK and share the builder fee.
- **Advisers.** Accountants and industry associations use watch mode and paper mode as a free assessment tool, then refer clients.
- **Self-serve.** Paper mode is free and needs no wallet, which gives a short path from curiosity to a first hedge.
- **The Hyperliquid ecosystem.** Keel brings new, non-speculative users and steady open interest to HIP-3 markets.

**Jurisdictions.** Keel will block restricted jurisdictions in line with Hyperliquid's terms and local law, and will seek legal review market by market before onboarding live customers.

## 6. Business model

| Stream | Pricing | Notes |
|---|---|---|
| **Builder fee** | 0.03% of each hedge trade | Enforced by Hyperliquid and capped by the user's on-chain approval. Collected automatically. |
| **Subscription** | Free (paper, watch mode) · Pro **$49/mo** · Business **$299/mo** | Pro: live hedging, hosted 24/7 guardian, reports. Business: multiple users and entities, accounting exports, API. |
| **Embedded / API** | Revenue share on partner builder fees | The SDK is open source; the hosted guardian and partner support are paid. |

**Illustrative projections.** These are assumptions, not traction:

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Paying businesses | 150 | 1,000 | 4,000 |
| Subscription revenue (blended $80/mo) | $144K | $960K | $3.84M |
| Hedge volume from direct customers (≈4× average notional a year) | $90M | $800M | $4B |
| Builder fees, direct (0.03%) | $27K | $240K | $1.2M |
| Volume routed through embedded partners | — | $500M | $3B |
| Builder fees, partners (0.03%) | — | $150K | $900K |
| **Total revenue** | **≈ $171K** | **≈ $1.35M** | **≈ $5.9M** |

For scale, all Hyperliquid builder codes together routed $24B of volume in a recent 30-day period [9].

**Cost structure.** No balance-sheet risk, no custody, no market-making. The main costs are engineering, hosting the 24/7 guardian with secure key management, legal work, and partnerships.

## 7. Traction and status

- **Live product** on Vercel: market board, hedge wizard, dashboard with guardian, simulation lab, and watch mode on real accounts.
- **Open-source hedge engine** (`@keel/hedge-sdk`) with 33 unit tests, continuous integration, runnable examples, and methodology and architecture docs.
- **Checked against Hyperliquid:**
  - live mainnet prices, funding and positions;
  - signed HIP-3 orders accepted by the exchange's signature check on testnet;
  - watch mode analysing real accounts holding over $20M in commodity positions.
- **No customers yet.** The next milestone is design partners (section 8).

## 8. Roadmap

| When | Milestone |
|---|---|
| **Q4 2026** | Mainnet pilot with 5–10 design-partner businesses. Hosted 24/7 guardian with keys in a KMS. Builder fee switched on. Split large orders into smaller ones over time to limit price impact. |
| **Q1 2027** | New benchmarks as HIP-3 lists them (agricultural contracts, more currencies). Multi-user business accounts. Xero and QuickBooks exports. |
| **Q2 2027** | Partner API and SDK release. Portfolio margin across hedges. Earn yield on idle margin (e.g. HyperEVM lending) to lower the cost of holding a hedge. |
| **2027+** | Launch Keel's own HIP-3 markets for benchmarks businesses need but nobody lists yet, such as regional fuel and refined-product indices. |

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Basis risk.** Local prices don't move exactly with global benchmarks. | Every fuel plan says plainly that it hedges the crude component. Hedge ratios default to 75%. Refined-product benchmarks are on the roadmap. |
| **Regulation.** Derivatives rules vary by country. | Non-custodial software. Block restricted jurisdictions. Legal review before live onboarding in each market. |
| **Venue and market-deployer risk.** Exchange outages, oracle problems or market halts. | Isolated margin per hedge. Spread across benchmarks. Monitor deployer status. The `Venue` interface allows more venues later. |
| **Funding costs.** | Plans use median funding and show carry as an annual rate. The guardian reports costs as they accrue. |
| **Cash tied up in margin.** | Low leverage by design. Portfolio margin and yield on idle margin are on the roadmap. |
| **Education and trust.** | Business-language interface, stress tests before locking, a free paper mode, and open-source code. |

## 10. Team

**RagaCrypt, founder** · [X @RagaCrypt](https://x.com/RagaCrypt) · [ragafolio.space](https://ragafolio.space) · [GitHub Raga-vibe](https://github.com/Raga-vibe)

A data analyst and AI builder who works at the intersection of **markets, on-chain data and software that moves money safely**. Designed and shipped Keel solo, end to end: hedge engine, web app, 24/7 keeper and docs.

Relevant prior work:

- **[VaultOS](https://github.com/Raga-vibe/vaultos):** spending limits for AI agents that can move money (Next.js, TypeScript, Coinbase AgentKit on Base). It's the same safety principle as Keel's agent key, which can trade but never withdraw.
- **[InsightFlow](https://github.com/Raga-vibe/insightflow):** live AI data-analysis tool. Drop in a spreadsheet, ask in plain English, get the answer with a chart. Built for a Devpost challenge.
- **Research in progress:** whether on-chain data improves crypto volatility prediction (statistics, time series, machine learning). This work feeds directly into Keel's risk engine and stress tests.

**Hiring next:** a derivatives and risk engineer, and a partnerships lead for fuel-card and stablecoin-treasury platforms.

## 11. The ask

Keel is applying to the **Colosseum accelerator** ($250K pre-seed). Use of funds:

- Legal and regulatory review for the first markets.
- Hosted guardian security (key management, audits).
- Onboarding the first design partners.
- The first engineering hire.

---

### Sources

1. ATRI, *Operational Costs of Trucking 2025*, via [FleetOwner](https://www.fleetowner.com/operations/article/55392569/atri-report-breaks-down-class-8-truck-operating-costs-by-region-and-expense-category) and [Fleet Maintenance](https://www.fleetmaintenance.com/equipment/article/55301363/american-transportation-research-institute-atri-breakdown-of-atri-2025-operational-costs-report)
2. ATA, [*American Trucking Trends 2025*](https://www.trucking.org/news-insights/ata-american-trucking-trends-2025), via [FreightWaves](https://www.freightwaves.com/news/there-are-292000-shippers-in-america-and-97-of-carriers-have-10-trucks-or-less-the-match-has-been-right-in-front-of-you-the-whole-time)
3. CME Group, [NY Harbor ULSD Futures contract specs](https://www.cmegroup.com/markets/energy/refined-products/heating-oil.contractSpecs.html)
4. World Gold Council, [*Gold Demand Trends: Full Year 2025*, Jewellery](https://www.gold.org/goldhub/research/gold-demand-trends/gold-demand-trends-full-year-2025/jewellery)
5. Chudasama et al., [*Why Don't Small Exporters Hedge?*](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7421999) (SSRN); [Fexco, Currency Hedging for SMEs](https://www.fexco.com/news-and-insights/currency-hedging-sme/)
6. Kantox study, via [Kantox Micro-hedging](https://www.kantox.com/micro-hedging) and [MoneyTransferComparison](https://moneytransfercomparison.com/kantox/)
7. World Bank, [SME Finance](https://www.worldbank.org/ext/en/topic/competitiveness/small-and-medium-enterprises-smes-finance)
8. CoinGecko, [Top Hyperliquid builders](https://www.coingecko.com/research/publications/top-hyperliquid-builders); [Dwellir, Hyperliquid Builder Codes](https://www.dwellir.com/blog/hyperliquid-builder-codes)
9. [KuCoin Insight: Hyperliquid builder codes 30-day revenue and volume](https://www.kucoin.com/news/insight/META/6aa947a57d10fa0007cdaa20)

Market figures in section 2 and the worked example were measured from Hyperliquid's public API on 24 Sep 2026 and can be reproduced with `npm run plan` and the SDK's `loadMarkets`.
