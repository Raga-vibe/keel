# How Keel hedges

This is the math behind every Keel plan, with the reasoning for each choice. All of it is implemented in [`packages/sdk`](../packages/sdk) and covered by unit tests.

**Notation.** `q` quantity per period, `N` periods, `h` hedge ratio, `k` instrument units per user unit, `P` perp price, `S` position size, `s` side (+1 long, −1 short), `L` leverage, `Lmax` the market's max leverage.

## 1. From business units to a perp position

A business describes what it buys or sells in its own units. Each catalog entry maps those units onto a Hyperliquid HIP-3 perp quoted per *instrument unit*:

| Exposure | Perp | Instrument unit | Conversions `k` |
|---|---|---|---|
| Diesel, petrol, jet fuel | `xyz:BRENTOIL` (or `xyz:CL`) | barrel | 1 L = 1/158.987 bbl · 1 US gal = 1/42 bbl |
| Natural gas | `xyz:NATGAS` | MMBtu | 1 therm = 0.1 · 1 GJ = 0.9478 · 1 MWh = 3.4121 |
| Gold, silver, platinum, palladium | `xyz:GOLD` … | troy ounce | 1 g = 1/31.1035 ozt |
| Copper | `xyz:COPPER` | pound | 1 kg = 2.20462 lb · 1 t = 2,204.62 lb |
| EUR, GBP invoices | `xyz:EUR`, `xyz:GBP` | 1 unit of currency | 1 |
| JPY invoices | `xyz:JPY` (yen per dollar) | USD | see §3 |

Total exposure in instrument units: **`Q = q · N · k`**.

## 2. Direction

- A business that **buys** is hurt when prices rise, so it goes **long** (`s = +1`).
- A business that **produces or sells** is hurt when prices fall, so it goes **short** (`s = −1`).

## 3. Size

**`S = floor_lot(h · Q)`**, rounded *down* to the market's lot size (`szDecimals`), so Keel never over-hedges.

**Inverse FX (USD/JPY).** Paying `X` yen costs `C(P) = X / P` dollars when the quote `P` is yen per dollar. A falling `P` (stronger yen) raises the cost:

```
dC/dP = −X / P²
```

A short of `S` units earns `S · (P₀ − P₁)`. Matching first-order sensitivity gives **`S = h · X / P₀²`**, and the direction flips: yen payers go short USD/JPY. The hedge is exact to first order. The convexity gap is small: on a 10% yen rally it covers 90% of the extra cost (tested).

**Worked example (live, 24 Sep 2026).** 40,000 L of diesel a month for 6 months, 75% hedged:
`Q = 240,000 / 158.987 = 1,509.55 bbl` → `S = 1,132.16 bbl` long Brent at ≈ $97.9, notional ≈ $110.8k.

## 4. Leverage, margin and liquidation

Keel always uses **isolated margin**, so each hedge is ring-fenced from anything else in the account.

Hyperliquid liquidates a position when its equity falls to maintenance margin, which is half the initial margin at max leverage: **`l = 1 / (2 · Lmax)`**. With equity `E` (margin plus unrealised PnL) at price `P`:

```
E + s·S·(Pliq − P) = l·S·Pliq     ⇒     Pliq = (s·P − E/S) / (s − l)
```

At open, `E = S·P / L`.

**Auto-leverage** picks the highest `L ≤ 3` whose liquidation is at least **45%** away (commodities) or **30%** away (major FX, which rarely moves 30% in a year). For Brent (`Lmax = 20`, `l = 2.5%`), 2x long liquidates at `(P − P/2) / 0.975 = 0.513·P`, a **48.7% drop**. Users can override leverage; above 5x, the plan warns.

## 5. Costs

- **Exchange fees:** `2 · S·P · 0.09%`, a conservative taker estimate for opening plus progressively closing.
- **Keel fee:** `2 · S·P · 0.03%`, the builder fee. It's only charged when a builder address is configured, and it's capped by the user's on-chain approval.
- **Funding:** accrues hourly on the *open* size, which steps down at each settlement:

```
funding = Σ over periods  s · S_open · P · f · hours_in_period
```

**Why `f` is the median, not the mean.** Over the 14 days to 24 Sep 2026, Brent's hourly funding had:

| | Hourly rate |
|---|---|
| Median | +0.000625% (≈ +5.5% a year) |
| Mean | −0.0071% (≈ −62% a year) |
| Minimum | −0.075% |

A handful of squeeze hours dominated the mean. Planning a 6-month hedge off the mean would have promised the business an 18% *income* that won't recur. The median reflects the carry a patient hedger actually pays. The worked example costs **≈ 1.8% all-in over 6 months**.

## 6. Unwind schedule

The hedge shrinks as the business makes each purchase. Settlement `i` closes `floor_lot(S / N)`, and the final step closes whatever remains (absorbing lot rounding). Monthly dates clamp to month-end (31 Jan → 28 Feb). Slices under Hyperliquid's $10 minimum order are batched into the next settlement.

## 7. What gets locked

For commodities, **locked price per user unit = entry price · k**. For the diesel example that's ≈ **$0.618 per litre**: the *crude component* of the business's fuel cost.

**Basis risk, stated plainly.** Pump or wholesale diesel = crude + refining margin + taxes + delivery. Keel hedges the crude part, which drives most month-to-month swings, and tells users so on every fuel plan. Natural gas is priced off Henry Hub, and regional prices can differ.

## 8. Stress tests

For a move `ΔP` applied to the whole remaining exposure (the worst case), with `d = +1` for buyers and `−1` for sellers:

```
unhedged impact = d · Q · ΔP                       (inverse FX: d · (X/P₁ − X/P₀))
hedge PnL       = s · S · ΔP                       (capped at −margin if liquidation is crossed)
net impact      = unhedged impact − hedge PnL + costs
```

## 9. The guardian

Evaluated on every refresh; decisions are pure, execution is separate.

| Condition | Action |
|---|---|
| Liquidation < **25%** away | Add margin to restore a **40%** buffer: `E* = S · (s·P − Pliq* · (s − l))` with `Pliq* = P · (1 − s·0.40)`; top-up = `E* − E`. |
| Not enough free collateral and < **10%** away | Close **25%** of the position so the rest survives; alert. |
| A purchase date has passed | Reduce-only close of that period's slice; book realised PnL against the hedge record. |
| On-chain size ≠ sum of hedge records | Alert (manual trade or liquidation). |
| Position is cross-margined | Alert only; isolated top-ups don't apply. |

In the paper demo, a 45% Brent crash takes the diesel hedge to 6.8% from liquidation; the guardian adds $19,751 and the buffer returns to 40%.

## 10. Limitations

- **Basis risk.** Local prices don't move 1:1 with global benchmarks.
- **Capital in margin.** A 2x hedge ties up half its notional. Future work: yield on idle margin, portfolio margin across hedges.
- **Funding is variable.** The median is a planning estimate, not a guarantee. Plans show carry as an annual rate so it can be monitored.
- **Liquidity.** Plans warn above 5% of a market's 24h volume. Large hedges should be sliced (TWAP is on the roadmap).
- **Regulation.** Perps are not recognised hedging instruments in every jurisdiction, and hedge accounting treatment varies. Keel is non-custodial software, not advice.
