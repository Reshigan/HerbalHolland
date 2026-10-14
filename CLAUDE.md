@AGENTS.md

# Herbal Holland platform: conventions

Commerce platform for a multi-owner (franchise) cannabis retail network in South Africa, built to scale to ~1,000 stores:
POS, inventory control, purchasing, finance, e-commerce (click & collect + delivery), Herbal Holland Rewards loyalty, marketing, HQ console, reports.
Single Next.js 16 app (App Router) + Prisma 7 + PostgreSQL, served at shop.herbalholland.com (`APP_URL`; herbalholland.co.za redirects there). Modular monolith: domain logic lives in `src/server/*` and pure rules in `src/lib/*`.

## Run it

```bash
npm install
npm run db:migrate     # prisma/migrations → database (DATABASE_URL in .env)
npm run db:seed        # demo network: 24 stores, ~18k members, 60 days of trading (truncates all tables!)
npm run dev            # http://localhost:3000
npm test               # vitest (pure domain rules)
npm run typecheck
```

User journeys (Playwright + DB checks, DEMO_MODE=true, seeded data; CI runs them against a production build):
`BASE_URL=http://localhost:3000 node e2e/<checkout|pos|backoffice|hq|shop|trade|accounting>.mjs`, and `node e2e/crawl.mjs` visits every
page as every role (fails on broken links, server errors and crashes; prints server and paint timings).

Schema changes: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change>` and commit the new
folder in `prisma/migrations` (CI and deploys run `prisma migrate deploy`). Run `npx prisma generate` after pulls.

Demo (DEMO_MODE=true): `/login` has one-click role logins (password `holland`), or GET
`/api/auth/demo?email=hq@herbalholland.com&next=/hq`. POS PINs: 1111 (manager, dispenser), 2222 (dispenser), 3333, 4444.

## Surfaces & routes

| Surface | Route | Look |
|---|---|---|
| Storefront + Herbal Holland Rewards (consumer PWA) | `/`, `/shop`, `/p/[slug]`, `/cart`, `/checkout`, `/orders/[code]`, `/stores`, `/learn`, `/club/*`, `/drops`, `/events/[slug]`, `/s/[ref]`, `/batch/[code]` | dark brand |
| POS (offline-first, tap on glass) | `/pos`, `/api/pos/*` | dark, touch-first |
| Store back office | `/store/[code]/*` | light content, dark sidebar |
| HQ console | `/hq/*` | light content, dark sidebar |
| The books (accounting per company: HQ and each franchisee) | `/books`, `/books/[companyId]/*` | light content, dark sidebar |
| Trade portal (wholesale buyers) | `/trade`, `/trade/*` | dark brand |
| Menu board (in-store TV) | `/menu/[slug]` | dark, 16:9 |
| Tax invoice (public, signed link) | `/invoice/[id]?t=` | print-friendly |
| Corporate site herbalholland.com (about, press, careers, contact, privacy, terms) | Not in this app: its own Cloudflare Worker, `sites/herbalholland.com`, with static pages (`npx tsx sites/herbalholland.com/build.ts` → `dist/`; words in `content.ts`, facts in `facts.ts`) and `worker.ts` for `/api/early-access` (the early-access list, in D1). No franchise page or enquiry form: `/franchise` redirects to `/about`. Deploy notes in `wrangler.jsonc` | dark brand, motion |

## Engineering rules

- Next 16: `params`/`searchParams` are Promises. Server components by default; client components only for interactivity.
  When unsure about an API, read `node_modules/next/dist/docs/`.
- Mutations = server actions in an `actions.ts` next to the page (`"use server"`), re-checking auth + scope inside the action,
  then `revalidatePath` / `redirect`. Use `useActionState` for inline errors.
- Auth & scope (never trust a client-supplied store id):
  - back office pages/actions: `const user = await requireStaff(); const store = await storeForUser(user, code);`
  - writes: `canManageStore(user)`; HQ pages: `requireStaff(HQ_ROLES)` + `scopedStoreIds(scopeOf(user))` (area managers see their region only).
- Reuse the domain services instead of writing new business logic in pages:
  `sales` (postPosSale, refundSale), `orders` (placeOrder, advanceOrder), `inventory` (availability, adjustStock, stock takes),
  `stock-orders` (createStockOrder, actOnStockOrder), `replenishment`, `pricing` (quote), `loyalty`, `customers`,
  `compliance` (evaluateBasket), `finance`, `marketing`, `studio` (campaign playbooks: createPlan, scheduleApproved, announceProducts for products going live; the playbooks
  are in `src/lib/studio-playbooks/`, one file per pack, and `tests/studio-calendar.test.ts` holds the six months' limits), `invoices`, `dashboard`, `settings`, `audit`,
  `banking` (recordDeposit, reviewDeposit), `ledger` (the books: business code only calls `queuePosting` /
  `queueStoreDay` inside its own transaction; postings are rebuilt from their source, never written by hand, and manual
  journals go through `ledger/admin`), `loss` (raiseAlerts; query alerts through `visibleAlerts`, so nobody sees an
  alert about themselves), `commission`, `storage` (putObject/getObject: R2/S3 or `UPLOAD_DIR`; serve files through the app).
- Money is integer cents (ZAR). Retail prices VAT-inclusive; wholesale/cost VAT-exclusive. Format with `zar`, `zarWhole`,
  `zarCompact` from `@/lib/money`; read typed amounts with `parseRand` and fill amount inputs with `centsToInput` (same file). Dates in SAST with `@/lib/format` helpers. Raw SQL time parts: `sast()` from `@/server/sql`.
- Consumer pages stay light at 1,000 stores: never render or serialise the whole store list on every page (the header
  store picker loads it when opened; counts come from `getStoreFootprint`), and paginate anything per store.
- Reporting at network scale reads the rollups (`DailyStoreStat`, `DailyVariantStat`), not raw sales. Raw-sales queries must be
  bounded by store(s) and date range. Every list is paginated (`Pagination`, `pageParam`).
- Every sensitive action writes `audit(...)`.
- Who "we" are and where people write: `legalNameOf` / `contactEmailOf` from `@/lib/contact` (the franchisor record first).
- POPIA: a new table that holds a member's details must be added to both `eraseMember` and `memberExport` in
  `src/server/popia.ts` (`tests/integration/popia.test.ts` sweeps every table).
- Scheduled work is a step in `JOBS` (`src/server/jobs.ts`): steps run on their own (a failure is reported, the rest still
  run) and must be idempotent; a new job needs its window in `JOB_WINDOWS` (`src/lib/jobs.ts`).
- Compliance is data-driven (`@/lib/compliance` + HQ settings): licence-gated THC (medical mode by default: SAHPRA patient
  authorisation + authorised dispenser), 18+ checks, Schedule 0 CBD limits, Medicines Act s18A (no incentives on medicines),
  POPIA consent + CPA send windows for marketing. Don't bypass it in UI code.
  Classes: `THC`, `CBD` (supplements; no incentives by default via `noIncentives`), `CBD_FOOD` (≤ 0.0075%, naturally occurring), `CBD_TOPICAL`, `HEMP`, `SUPPLEMENT` (no cannabis), `ACCESSORY`, `APPAREL`, `GROW`. Rules and product facts (net content, ingredients, R146 allergens) are in `validateProduct()`.
- No new dependencies without a strong reason. Pure logic goes in `src/lib` with a vitest test in `tests/`.

## Design language

- Brand: Holland orange `brand-500 #F5913C` on warm black `ink-950 #0C0A09`; cream `ink-50` for light surfaces.
  Tokens live in `src/app/globals.css` (`@theme`). Never hard-code other brand colours.
  Faintest text on dark surfaces is `ink-450` (AA contrast on ink-950/900/850); `ink-500` is for light surfaces only.
- Type: `font-display` (Outfit) for headings, hero numbers, the wordmark; Inter for UI. `tnum` for numeric columns.
  `.eyebrow` for small uppercase labels (brand-700 on light, brand-500 on dark).
- Shapes: cards `rounded-2xl`, buttons pill (`rounded-full`), inputs `rounded-xl`. The window-poster frame (`.hh-frame`)
  is reserved for hero/brand moments.
- Components: `@/components/ui/*` (Button/ButtonLink, Card, Badge, StatusBadge/TierBadge, Field/Input/Select/Checkbox,
  Table/Th/Td/Tr (+ SortableTh/sortParams for URL sorting, TableEmpty, TableSkeleton; `Table` takes `density`, `stickyFirst`,
  `minWidth`, `Tr` takes `href` for row links), InlineEdit (a cell that posts to a server action with optimistic feedback), ActionForm/ConfirmAction/SubmitButton
  (server-action forms with inline errors),
  PageHeader/EmptyState/Notice, Stat/Meter, TabLinks, RangeTabs, Pagination, Avatar/Detail),
  admin shell `@/components/admin/*` (AdminShell with keyboard shortcuts + command palette, NavProgress, SavedViews),
  brand `@/components/brand/logo` (Mark, Logo, Lockup, Wordmark), `@/components/product/art` (ProductArt; no stock photos),
  charts `@/components/charts/*` (AreaChart, ColumnChart, Donut, BarList, Heatmap, Sparkline).
- Charts follow the dataviz rules: series colours `var(--color-series-1..8)` in fixed order (validated palette), one axis,
  legend only for ≥2 series, text in ink colours (never series colours), hover tooltips on.
- Icons: `lucide-react`, 16–20px, strokeWidth ~1.9.
- Copy: warm, plain English, confident; "adults 18+"; no stoner clichés, no medical claims (CBD claims only from the
  approved list); run marketing copy through `screenCopy`.
- Accessibility: labelled inputs, visible focus, colour never the only signal, 44px touch targets on POS/mobile.
