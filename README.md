# Herbal Holland — commerce platform

**Dutch heritage. African soil.** One platform for a multi-owner cannabis & wellness retail network in South Africa,
built to run ~1,000 franchise stores: point of sale with tap-on-glass cards, deep inventory control, stores buying and
selling stock, finance and franchise settlement, a single national e-commerce brand (click & collect, same-day and
nationwide delivery), the Herbal Holland Rewards loyalty app, marketing automation, an HQ console and a full reports centre —
compliance-first by design.

| Surface | Route | For |
|---|---|---|
| Storefront + Herbal Holland Rewards (PWA) | `/`, `/shop`, `/p/[slug]`, `/cart`, `/checkout`, `/orders/[code]`, `/stores`, `/learn`, `/club` | Customers & patients |
| Dispensary (licensed medicines) | `/dispensary` — visible only to signed-in patients with an active authorisation | Patients |
| POS — offline-first, tap on glass | `/pos` | Budtenders & dispensers |
| Store back office | `/store/[code]` | Store managers & franchise owners |
| HQ console | `/hq` | Head office & area managers |
| Reports centre | `/store/[code]/reports`, `/hq/reports` | Everyone, scoped |
| In-store menu boards | `/menu/[slug]` | Store TVs |
| Brand book | `/brand` | Marketing & partners |
| Public documents | `/invoice/[id]?t=` (signed tax invoice), `/batch/[code]` (lab results), `/unsubscribe` | Customers |

## Quick start

```bash
npm install
cp .env.example .env              # set DATABASE_URL
npm run db:migrate                # apply prisma/migrations
npm run db:seed                   # demo network (24 stores, ~18k members, 60 days of trading) — truncates all tables
npm run dev                       # http://localhost:3000
```

Demo access (`DEMO_MODE=true`) — `/login` has one-click logins; password `holland`:

| Role | Email |
|---|---|
| HQ administrator | `hq@herbalholland.co.za` |
| Area manager (Tshwane & North) | `area.gpn@herbalholland.co.za` |
| Franchise owner (Hatfield + Brooklyn) | `thabo@mokoenaretail.co.za` |
| Store manager / dispenser (Hatfield) | `manager.pta01@herbalholland.co.za` |

POS: open `/pos`, pair a store, then PIN `1111` (manager, dispenser), `2222` (dispenser), `3333`, `4444`.
Shop: `/` — the OTP code is shown on screen in demo mode.

Scale test: `SEED_STORES=1000 SEED_DAYS=30 npm run db:seed`.

## What's inside

- **Inventory control** — batch-level stock with FEFO picking and FIFO cost, an immutable movement ledger, blind stock
  takes and cycle counts, reason-coded adjustments (incl. witnessed destruction), expiry and recall management,
  replenishment suggestions, DC distribution and store-to-store network trading.
- **POS** — phone and tablet (portrait and landscape), tap on glass (Halo Dot SoftPOS adapter; simulated in demo), cash, PayShap, split tenders,
  points, bonus-buy prompts, compliance checks (18+, patient authorisations, dispensers), offline cash selling with
  idempotent sync, click & collect handover (order QR), member card QR, refunds, shifts and Z-reports.
- **Omnichannel** — one national shop; orders routed to the right store or DC; stores are merchant of record and get
  credited; nationwide courier for non-medicinal items; 15-minute click & collect.
- **Pricing & deals** — RRP, zones, scheduled changes, franchisee shelf prices, instant Rewards prices by tier and weekly
  member deals (Checkers Xtra Savings style), quantity breaks,
  near-expiry markdowns; % / R-off, bonus buys, BOGO, gifts with purchase, complementary deals, multi-buys, happy hours,
  points multipliers, usage caps.
- **Herbal Holland Rewards** — free national membership, easy phone sign-up (SMS code), digital card, instant tier
  savings (Seed 3% → Harvest 10%), points (1 point = R1), birthday and referral rewards, consent centre, cross-store
  settlement between franchisees.
- **Finance** — P&L, VAT201 working, cash-ups, expenses, monthly franchise statements; every invoice emailed
  (SARS abridged/full tax invoices; non-VAT vendors supported).
- **Marketing** — RFM segments, campaigns over SMS/email/push, POPIA consent ledger, CPA send windows, opt-out registry
  suppression, copy compliance lint, attribution and ROI.
- **Compliance** — SAHPRA medical mode (switchable to adult-use), licence gating per store, Schedule 0 CBD validation,
  Medicines Act s18A incentive exclusions, dispensing register, recalls, audit log.

## Documentation

- [Strategy: go-to-market, marketing playbook, beating the competition](docs/STRATEGY.md)
- [Architecture & scaling to 1,000 stores](docs/ARCHITECTURE.md)
- [Compliance by design](docs/COMPLIANCE.md)
- [Pricing & promotions engine](docs/PRICING.md)
- [Integrations (payments, couriers, messaging, ID, accounting)](docs/INTEGRATIONS.md)
- [Runbook](docs/RUNBOOK.md) · [Launch checklist](docs/LAUNCH-CHECKLIST.md)
- Research: [market study](docs/research/MARKET-STUDY.md) · [regulation](docs/research/COMPLIANCE-RESEARCH.md) ·
  [payments & logistics](docs/research/PAYMENTS-LOGISTICS-RESEARCH.md)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 + PostgreSQL 16 · Vitest · Playwright.
Deploy with the included `Dockerfile` / `docker-compose.yml`; CI in `.github/workflows/ci.yml`.
