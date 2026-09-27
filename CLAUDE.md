@AGENTS.md

# Herbal Holland platform — conventions

Commerce platform for a multi-owner (franchise) cannabis retail network in South Africa, built to scale to ~1,000 stores:
POS, inventory control, purchasing, finance, e-commerce (click & collect + delivery), Windmill Club loyalty, marketing, HQ console, reports.
Single Next.js 16 app (App Router) + Prisma 7 + PostgreSQL. Modular monolith: domain logic lives in `src/server/*` and pure rules in `src/lib/*`.

## Run it

```bash
npm install
npm run db:push        # schema → database (DATABASE_URL in .env)
npm run db:seed        # demo network: 24 stores, ~18k members, 60 days of trading (truncates all tables!)
npm run dev            # http://localhost:3000
npm test               # vitest (pure domain rules)
npm run typecheck
```

Demo (DEMO_MODE=true): `/login` has one-click role logins (password `holland`), or GET
`/api/auth/demo?email=hq@herbalholland.co.za&next=/hq`. POS PINs: 1111 (manager, dispenser), 2222 (dispenser), 3333, 4444.

## Surfaces & routes

| Surface | Route | Look |
|---|---|---|
| Storefront + Windmill Club (consumer PWA) | `/`, `/shop`, `/p/[slug]`, `/cart`, `/checkout`, `/orders/[code]`, `/stores`, `/learn`, `/club/*`, `/batch/[code]` | dark brand |
| POS (offline-first, tap on glass) | `/pos`, `/api/pos/*` | dark, touch-first |
| Store back office | `/store/[code]/*` | light content, dark sidebar |
| HQ console | `/hq/*` | light content, dark sidebar |
| Menu board (in-store TV) | `/menu/[slug]` | dark, 16:9 |
| Tax invoice (public, signed link) | `/invoice/[id]?t=` | print-friendly |

## Engineering rules

- Next 16: `params`/`searchParams` are Promises. Server components by default; client components only for interactivity.
  When unsure about an API, read `node_modules/next/dist/docs/`.
- Mutations = server actions in an `actions.ts` next to the page (`"use server"`), re-checking auth + scope inside the action,
  then `revalidatePath` / `redirect`. Use `useActionState` for inline errors.
- Auth & scope — never trust a client-supplied store id:
  - back office pages/actions: `const user = await requireStaff(); const store = await storeForUser(user, code);`
  - writes: `canManageStore(user)`; HQ pages: `requireStaff(HQ_ROLES)` + `scopedStoreIds(scopeOf(user))` (area managers see their region only).
- Reuse the domain services instead of writing new business logic in pages:
  `sales` (postPosSale, refundSale), `orders` (placeOrder, advanceOrder), `inventory` (availability, adjustStock, stock takes),
  `stock-orders` (createStockOrder, actOnStockOrder), `replenishment`, `pricing` (quote), `loyalty`, `customers`,
  `compliance` (evaluateBasket), `finance`, `marketing`, `invoices`, `dashboard`, `settings`, `audit`.
- Money is integer cents (ZAR). Retail prices VAT-inclusive; wholesale/cost VAT-exclusive. Format with `zar`, `zarWhole`,
  `zarCompact` from `@/lib/money`. Dates in SAST with `@/lib/format` helpers. Raw SQL time parts: `sast()` from `@/server/sql`.
- Reporting at network scale reads the rollups (`DailyStoreStat`, `DailyVariantStat`), not raw sales. Raw-sales queries must be
  bounded by store(s) and date range. Every list is paginated (`Pagination`, `pageParam`).
- Every sensitive action writes `audit(...)`.
- Compliance is data-driven (`@/lib/compliance` + HQ settings): licence-gated THC (medical mode by default: SAHPRA patient
  authorisation + authorised dispenser), 18+ checks, Schedule 0 CBD limits, Medicines Act s18A (no incentives on medicines),
  POPIA consent + CPA send windows for marketing. Don't bypass it in UI code.
- No new dependencies without a strong reason. Pure logic goes in `src/lib` with a vitest test in `tests/`.

## Design language

- Brand: Holland orange `oranje-500 #F5913C` on warm black `ink-950 #0C0A09`; cream `ink-50` for light surfaces.
  Tokens live in `src/app/globals.css` (`@theme`). Never hard-code other brand colours.
- Type: `font-display` (Outfit) for headings, hero numbers, the wordmark; Inter for UI. `tnum` for numeric columns.
  `.eyebrow` for small uppercase labels (oranje-700 on light, oranje-500 on dark).
- Shapes: cards `rounded-2xl`, buttons pill (`rounded-full`), inputs `rounded-xl`. The window-poster frame (`.hh-frame`)
  is reserved for hero/brand moments.
- Components: `@/components/ui/*` (Button/ButtonLink, Card, Badge, StatusBadge/TierBadge, Field/Input/Select/Checkbox,
  Table/Th/Td/Tr, PageHeader/EmptyState/Notice, Stat/Meter, TabLinks, RangeTabs, Pagination, Avatar/Detail),
  brand `@/components/brand/logo` (Mark, Logo, Lockup, Wordmark), `@/components/product/art` (ProductArt — no stock photos),
  charts `@/components/charts/*` (AreaChart, ColumnChart, Donut, BarList, Heatmap, Sparkline).
- Charts follow the dataviz rules: series colours `var(--color-series-1..8)` in fixed order (validated palette), one axis,
  legend only for ≥2 series, text in ink colours (never series colours), hover tooltips on.
- Icons: `lucide-react`, 16–20px, strokeWidth ~1.9.
- Copy: warm, plain English, confident; "adults 18+"; no stoner clichés, no medical claims (CBD claims only from the
  approved list); run marketing copy through `screenCopy`.
- Accessibility: labelled inputs, visible focus, colour never the only signal, 44px touch targets on POS/mobile.
