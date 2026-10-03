# Pricing & promotions engine

Two pure engines, used identically by the POS (online and offline), the web shop and the server:
`src/lib/pricing-rules.ts` (what a unit costs) and `src/lib/promotions.ts` (what deals apply). The server entry point is
`quote()` in `src/server/pricing.ts`; it always re-prices server-side.

## 1. Unit price resolution (`resolvePrice`)

Evaluated per line, in this order:

1. **RRP** — `Variant.priceCents`, the national recommended retail price (VAT incl.).
2. **Zone / channel lists** — the highest-priority active `PriceList` of kind `ZONE` or `CHANNEL` that applies to the
   store (by store or region; empty scope = network) and channel, within its date window. Covers regional pricing,
   tourist zones, online-only prices and **scheduled price changes** (set `startsAt`).
3. **Franchisee shelf price** — `StoreVariant.priceCents`. In store it always wins over steps 1–2: franchisees set their
   own prices (Competition Act). Online orders use the network online price.
4. **Instant Rewards price** (Checkers Xtra Savings style) — an identified member pays the lower of:
   - their **tier saving** off the shelf price (`settings.loyalty.tierSavingsPct`: Seed 3%, Sprout 5%, Bloom 7%,
     Harvest 10%), and
   - a **Rewards deal** — a `PriceList` of kind `MEMBER` (all members or specific tiers, usually a weekly window).

   `quote()` reports each line's `memberSavingsCents` (vs the walk-in price) and, for walk-ins, `joinSavingsCents` (what
   joining at Seed would save on this basket now). Savings are stored on `SaleLine`/`Sale`/`OrderLine` and rolled up in
   `DailyStoreStat.memberSavingsCents`; refunds reverse them.
5. **Quantity breaks** — list items with `minQty > 1` ("papers: R30 each for 10+") when they beat the above.
6. **Near-expiry markdown** (POS) — when the next lot to sell (FEFO) expires within `settings.pricing.markdownDays`,
   take `markdownPct` off.

Each line reports the rule that set its price (e.g. "Bloom Rewards −7%", "Rewards deal", "Volume pricing (10+)",
"Near-expiry −20%"), shown on receipts and in carts.

**Incentive exclusion:** when a line is excluded from incentives (licensed medicines in MEDICAL mode — Medicines Act
s18A), steps 4–6 are skipped.

## 2. Promotions (`applyPromotions`)

| Kind | Example | Fields |
|---|---|---|
| `PERCENT` | 15% off apparel & accessories | `value` = %, `categoryIds` / `productIds` |
| `FIXED` | R50 off orders over R500 (untargeted) · R20 off each tray (targeted) | `value` = cents, `minSpendCents` |
| `MULTIPLIER` | Double Points Fridays | `value` = ×100, `days` |
| `BUY_X_GET_Y` | Buy 2 get 1 free · tray + free papers · spend R600 get the grinder · papers 50% off with flower | `buyQty`, `getQty`, `rewardPercent`, `reward*Ids`, `minSpendCents` |
| `MULTIBUY` | Any 2 CBD wellness for R800 | `buyQty`, `value` = bundle price |

Common fields: `code` (promo code), `channels` (POS/ONLINE), `storeIds` (empty = network; store-owned promos set
`ownerStoreId`), `startsAt`/`endsAt`, `days` + `startMinute`/`endMinute` (happy hours, SAST), `maxUses`.

**Order of play** (predictable, no double-dipping):

1. Unit deals — `MULTIBUY` bundles and `BUY_X_GET_Y` bonus buys claim the units they use (the cheapest qualifying
   unit is the reward).
2. Line deals — each remaining unit takes the single best `PERCENT` / targeted `FIXED` discount.
3. Basket deal — the best untargeted `FIXED` amount, spread across lines so VAT per line stays exact.
4. Points multiplier — the highest applicable.

Lines excluded from incentives neither receive deals nor count towards thresholds.

**Suggestions:** when a deal is close but not triggered ("add 1 more pre-roll", "spend R120 more to unlock the
grinder", "papers are 50% off with your flower — add them"), the engine returns `suggestions` that the POS and web shop
show as one-tap prompts.

## 3. VAT

Retail prices are VAT-inclusive; VAT per line = round(total × 15/115). Non-VAT-vendor franchisees (below the R2.3m
threshold) charge no VAT: their sales post with zero VAT and their invoices are titled "Invoice", not "Tax Invoice".

## 4. Trade prices (the WHOLESALE channel)

`quote({ channel: "WHOLESALE", tradeAccountId })` uses the trade engine (`resolveTradePrice` in
`src/lib/pricing-rules.ts`, `tradeQuote` in `src/server/pricing.ts`); the consumer steps above never run.

1. **The account's own TRADE list** (`TradeAccount.priceListId`), when it prices the variant.
2. **The live TRADE lists by priority** (newest first on a tie): the first list that prices the variant decides, taking
   its best quantity break with `minQty ≤ qty`. `adjustPct` on a TRADE list adjusts the wholesale price. TRADE lists are
   national (store and region scopes are ignored) and hold **ex-VAT** prices.
3. **`Variant.wholesaleCents`** (ex VAT) when no list prices it. A variant with neither isn't in the trade range.

VAT is 15% of each line's ex-VAT total, rounded half up to the cent (`vatHalfUp`), never backed out of an inclusive
price; the quote's `exCents` is the lines ex VAT and `totalCents = exCents + vatCents`. Promotions apply only when the
promotion's channels include WHOLESALE, to the same `incentiveExcluded` rule as everywhere else (no promotion on
medicines), and are rounded to a whole cent per unit so a trade order line can carry the net unit price. Tiers,
member deals, zone/channel lists, shelf prices, markdowns and My Deals never touch a trade quote. THC is never priced.
Orders are placed in multiples of `Variant.caseQty` above `settings.trade.minOrderCents`; courier and click & collect
handling fees come from `settings.trade` and carry their own VAT line.
