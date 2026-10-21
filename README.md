# Herbal Holland commerce platform

**Dutch heritage. African soil.** One platform for a multi-owner cannabis & wellness retail network in South Africa,
built to run ~1,000 franchise stores: point of sale (cards on a Yoco machine, or tap on glass), deep inventory control, stores buying and
selling stock, finance and franchise settlement, the books (accounting for HQ and every franchisee), a single national
e-commerce brand (click & collect, same-day and nationwide delivery), wholesale to trade customers, the Herbal Holland
Rewards loyalty app, marketing (segments, campaigns, consent), an HQ console and a full reports centre, with
compliance built into every part.

| Surface | Route | For |
|---|---|---|
| Storefront + Herbal Holland Rewards (PWA) | `/`, `/shop`, `/p/[slug]`, `/cart`, `/checkout`, `/orders/[code]`, `/stores`, `/learn`, `/club`, `/drops`, `/events/[slug]`, `/s/[ref]` (share cards) | Customers & patients |
| Dispensary (licensed medicines) | `/dispensary` (visible only to signed-in patients with an active authorisation) | Patients |
| POS (offline-first, tap on glass) | `/pos` | Member advisors & dispensers |
| Store back office | `/store/[code]` | Store managers & franchise owners |
| HQ console | `/hq` | Head office & area managers |
| The books (accounting per company) | `/books`, `/books/[companyId]` | Owners, their accountants, HQ finance |
| Trade portal (wholesale) | `/trade` (apply at `/trade/apply`) | Pharmacies, retailers, cafés, practices |
| Reports centre | `/store/[code]/reports`, `/hq/reports` | Everyone, scoped |
| In-store menu boards | `/menu/[slug]` | Store TVs |
| Brand book | `/brand` | Marketing & partners |
| Public documents | `/invoice/[id]?t=` (signed tax invoice), `/batch/[code]` (lab results), `/unsubscribe` | Customers |

## Quick start

```bash
npm install
cp .env.example .env              # set DATABASE_URL
npm run db:migrate                # apply prisma/migrations
npm run db:seed                   # demo network (24 stores, ~18k members, 60 days of trading); truncates all tables!
npm run dev                       # http://localhost:3000
```

With `DEMO_MODE=true`, `/login` has one-click logins (password `holland`):

| Role | Email |
|---|---|
| HQ administrator | `hq@herbalholland.com` |
| Area manager (Tshwane & North) | `area.gpn@herbalholland.com` |
| Franchise owner (Hatfield + Brooklyn) | `thabo@mokoenaretail.co.za` |
| Accountant (Mokoena Retail's books) | `books@mokoenaretail.co.za` |
| Store manager / dispenser (Hatfield) | `manager.pta01@herbalholland.com` |
| Trade buyer (Greenleaf Pharmacy, on account) | `trade@greenleafpharmacy.co.za` on the trade portal, `/trade/login` (no password: a sign-in code, shown on screen in demo mode) |

POS: open `/pos`, pair a store, then PIN `1111` (manager, dispenser), `2222` (dispenser), `3333`, `4444`.
Shop: `/`. The sign-in code is shown on screen in demo mode.
Trade (wholesale): `/trade`. Businesses apply at `/trade/apply`; the demo buyer above has an approved account on 30-day terms with orders, invoices and a statement.

Scale test: `SEED_STORES=1000 SEED_DAYS=30 npm run db:seed`.

## Install the apps

All three web apps install straight from the browser, not from an app store. Each has its own manifest and icon, the prompts
live in the app itself, and a dismissal is remembered on the device only (30 days; "Not now" on a till is a day).
Nothing about installs is sent to the server. Rules: `src/lib/install.ts`; UI: `src/components/ui/install-prompt.tsx`.

| App | Manifest | Where the nudge shows | Opens at |
|---|---|---|---|
| Herbal Holland Rewards (members) | `/manifest.webmanifest` | Rewards home (`/club`), and once on the shop home for signed-in members | `/club` (the card) |
| Till | `/pos/manifest.webmanifest` | The pair screen (before pairing) and Shift → This till | `/pos`, full-screen; `/sw.js` keeps the shell offline |
| Back office (store + HQ) | `/staff/manifest.webmanifest` | The mobile header, and "Install app" in the side menu | `/store` → each person's home by role |

- **Android** (Chrome, Edge, Samsung Internet): tap **Install** on the nudge and the browser's own install sheet opens.
  It is also in the browser menu ("Install app" / "Add to Home screen").
- **iPhone and iPad** (Safari only): the nudge shows the two steps: **Share**, then **Add to Home Screen**. Chrome,
  Firefox and in-app browsers (WhatsApp, Instagram…) on iOS can't add web apps, so nothing is shown there.
- **Desktop** (Chrome, Edge): **Install** on the nudge, or the install icon at the right of the address bar. Firefox
  and Safari on desktop don't install web apps.

Installed apps open full-screen with their own icon (Rewards: orange on warm black; till: black on orange; back office:
black on cream). The browser only offers installs on HTTPS (or localhost) with `APP_URL` set to the public origin.

## What's inside

- **Inventory control:** batch-level stock with FEFO picking and FIFO cost, an immutable movement ledger, blind stock
  takes and cycle counts, reason-coded adjustments (incl. witnessed destruction), expiry and recall management,
  replenishment suggestions, DC distribution and store-to-store network trading.
- **POS:** phone and tablet (portrait and landscape), Yoco card machines, tap on glass (Halo Dot SoftPOS adapter; simulated in demo), cash, PayShap, split tenders,
  points, bonus-buy prompts, compliance checks (18+, patient authorisations, dispensers), offline selling (cash and card
  machines) with idempotent sync, click & collect handover (order QR), member card QR, refunds, shifts and Z-reports.
- **Omnichannel:** one national shop (Vantax (Pty) Ltd takes the online payments); orders routed to the right store or
  DC, where the sale posts; nationwide courier for non-medicinal items; click & collect, usually ready within 2 hours.
- **Pricing & deals:** RRP, zones, scheduled changes, franchisee shelf prices, instant Rewards prices by tier and weekly
  member deals (Checkers Xtra Savings style), quantity breaks,
  near-expiry markdowns; % / R-off, bonus buys, BOGO, gifts with purchase, complementary deals, multi-buys, happy hours,
  points multipliers, usage caps.
- **Herbal Holland Rewards:** free national membership, easy phone sign-up (SMS code), digital card, instant tier
  savings (Seed 3% → Harvest 10%), points (1 point = R1), birthday and referral rewards, consent centre, cross-store
  settlement between franchisees.
- **Merch, made to order:** an embroidered collection (tee, hoodie, crewneck, cap, bucket hat, beanie; printed
  tote) made one at a time in South Africa by our merch partner and couriered white-label to the customer (courier on
  top); no stock, no minimums. Files for the partner: `npx tsx scripts/merch-export.tsx` → `public/merch/print`
  (vector PDF, SVG, 300 dpi PNG); specs in the brand book (`/brand#merch`).
- **Launch programme:** a Founding Members list with a referral ladder while the shop trades, numbered Founding
  Members (a Sprout floor for a set number of months), sign-ups tracked by source (`/club/join?src=…`),
  drops with tier early access and per-member limits, opening-weekend events with QR tickets, first-purchase welcome
  gifts, My Deals (weekly personal offers, HQ-funded), Learn quests, shareable savings cards, app push.
- **Finance:** P&L, cash-ups, expenses, monthly franchise statements; every invoice emailed (SARS abridged/full tax
  invoices; non-VAT vendors supported).
- **The books:** a general ledger per company (HQ and every franchisee, stores as a dimension) posted from the
  source events, never by hand: daily store journals, statements, stock, VAT201 working per SARS period (categories
  A, B, C, D and F), bank statement import with auto-matching, month-end checks and locks, an Accountant role.
- **Trade (wholesale):** business accounts with verified licences, ex-VAT trade prices and case packs, credit terms,
  pro formas and invoices, statements, and trade sales at the till.
- **Marketing:** RFM segments, campaigns over SMS/email/push, POPIA consent ledger, CPA send windows, opt-out registry
  suppression, copy compliance lint, attribution and ROI. Social posts to Instagram, Facebook, LinkedIn, X and Threads
  through Postiz (free, self-hosted), screened so the brand never sells cannabis or CBD on social.
- **Compliance:** members-only selling (every member accepts the versioned membership terms, recorded), SAHPRA
  medical mode (switchable to adult-use), licence gating per store, Schedule 0 CBD validation,
  Medicines Act s18A incentive exclusions, dispensing register, recalls, audit log.

## Testing

```bash
npm test                          # unit: pure rules (pricing, promotions, compliance, loyalty, SA calendars…)
npm run test:integration          # domain services against a fresh SQLite file (.data/hh_test.sqlite, or TEST_DATABASE_URL=file:…)
node e2e/checkout.mjs             # phone checkout: sign-up by SMS code → collect → pay → order (DEMO_MODE, seeded)
node e2e/pos.mjs                  # till: pair → PIN → shift → sales → refund → offline + sync → handover → Z-report
node e2e/crawl.mjs                # every page as every role: broken links, server errors, crashes, timings
                                  # also backoffice, hq, shop, trade and accounting journeys (e2e/*.mjs)
npx tsx scripts/bench.ts [--write] # timings on a production-sized copy (SEED_STORES=1000)
```

CI (`.github/workflows/ci.yml`) checks the migrations against the schema, runs typecheck, unit, integration and build,
builds the production image, then runs seven end-to-end journeys and the crawl against a production build.

## Documentation

- [Strategy: go-to-market, marketing playbook, beating the competition](docs/STRATEGY.md)
- [Architecture & scaling to 1,000 stores](docs/ARCHITECTURE.md)
- [Compliance by design](docs/COMPLIANCE.md)
- [Pricing & promotions engine](docs/PRICING.md)
- [Integrations (payments, couriers, messaging, ID)](docs/INTEGRATIONS.md)
- [Runbook](docs/RUNBOOK.md) · [Launch checklist](docs/LAUNCH-CHECKLIST.md)
- [Marketing plan (KZN launch and online)](docs/MARKETING-PLAN.md) · [Search (SEO)](docs/SEO.md)
- [System guide (PDF, every screen by role)](docs/Herbal-Holland-System-Guide.pdf)
- Research: [market study](docs/research/MARKET-STUDY.md) · [regulation](docs/research/COMPLIANCE-RESEARCH.md) ·
  [payments & logistics](docs/research/PAYMENTS-LOGISTICS-RESEARCH.md)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 + Cloudflare D1 · Vitest · Playwright.
Runs on Cloudflare Workers (OpenNext), D1, R2 and Browser Rendering ([docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)); a merge
to main deploys it (`.github/workflows/deploy-shop.yml`, [runbook](docs/RUNBOOK.md#first-deploy)). CI in
`.github/workflows/ci.yml`; the whole platform on a staging Worker in `test-cloudflare.yml`.
