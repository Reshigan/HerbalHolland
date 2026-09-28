# Launch checklist

Tick every line before the first store trades on the platform.

## Legal & compliance
- [ ] Counsel sign-off: MEDICAL-mode flows, class × channel matrix, storefront visibility of licensed products, claims library
- [ ] SAHPRA licence details captured per store (`licences`, `licenceRef`); dispensers designated and trained
- [ ] Patient-authorisation intake procedure and document storage agreed
- [ ] CBD master data validated (≤ 600 mg/pack, ≤ 20 mg/day, approved claims, COAs per batch)
- [ ] Information Officer (Reshigan Govender) registered with the Information Regulator; privacy notice published (PAIA manual: done, herbalholland.com/paia; add the registration number and address to `sites/herbalholland.com/facts.ts`)
- [ ] Counsel signs off the membership terms (`/legal/terms`) and fills in the directors' names; bump `TERMS_VERSION` for any change after launch
- [ ] Returns & refunds (`/legal/returns`) and delivery (`/legal/delivery`) policies: drafted (CPA s56, ECTA s44 cooling-off and s46, delivery only to the member named on the order, fees and cut-off from HQ → Online orders) — counsel to review, above all the ECTA s42 exclusions line marked "For counsel" (made-to-order merch; opened food, drink, supplements and skin care) and the failed-delivery terms (two attempts, redelivery at the courier fee, goods refunded without the delivery fee); confirm the attempts with the courier
- [ ] HQ → Compliance: **Members only** on; tills trained on signing up walk-ins (key terms read, box ticked) and on member numbers while offline
- [ ] NCC direct-marketing registration done; first opt-out registry import loaded
- [ ] Franchise agreements reference the separate marketing fund and statement settlement

## Money
- [ ] Each store onboarded with Yoco for its card machine (honest description, written approval for the product mix); tills on `NEXT_PUBLIC_TAP_PROVIDER=YOCO`, cashiers trained to key in the machine's reference
- [ ] Online payments on Yoco (Vantax (Pty) Ltd): written approval for the product mix, domain verified, live keys and live webhook set, a live payment and a refund tested ([RUNBOOK → Yoco go-live](RUNBOOK.md#yoco-go-live-online-payments-and-in-store-card-machines))
- [ ] VAT numbers per franchisee captured (non-vendors marked); invoice templates checked against SARS requirements
- [ ] Royalty / levy / e-commerce commission rates confirmed per store; first statement dry-run reconciled
- [ ] Accounting export (Sage/Xero daily journal) agreed with each owner's bookkeeper

## Stock
- [ ] Catalogue, variants, barcodes (GS1 600-prefix) and RRPs loaded; ranging by format. The loader is ready: HQ → Catalogue → Import (CSV template, dry-run preview, create or update by SKU, every product checked against its class's rules)
- [ ] Warehouse opening stock loaded with the import (stock, batch and expiry columns; received at HQ cost) and checked against a physical count
- [ ] Opening stock counted per store (full blind stock take) and approved
- [ ] DC replenishment cadence and lead times set; par/reorder levels reviewed

## Merch (made to order)
- [ ] Merch partner agreed (Lucani trade account; OneOff as fallback): prices at 1/5/10 units, digitising, blanks, courier rates, white-label packing, payment terms
- [ ] Partner confirms in writing that it makes merch for a CBD/wellness brand; stitch files and any partner-made artwork owned by (or released to) Herbal Holland
- [ ] Each stitched design digitised once; thread sew-out approved against Sunset 500; sample of every piece approved (placements, wash test, hoodie blank colour)
- [ ] Lucani adds the beanie and bucket hat (Captivity blanks, no minimum); cuff sample approved (40 mm, outer layer only) — else GetCapped with blind shipping confirmed in writing
- [ ] Variant costs and merch partner codes set in HQ → Catalogue; `POD_EMAIL` and the merch courier fee set
- [ ] DC team trained on **Merch shipped** (tracking from the partner's email) and on chasing late orders

## Devices & people
- [ ] Android devices (11+, Google services, no developer options) paired per till; printers tested; barcode scanners tested
- [ ] Staff accounts with PINs; managers with passwords; area managers assigned to regions
- [ ] Training: POS (sale, split tenders, offline, refunds), handover with ID checks, stock takes, receiving, recalls

## Customer channels
- [ ] SMS and email providers live (`SMTP_URL`, `MESSAGING_PROVIDER`); sender footer details correct
- [ ] Storefront content (Learn articles, store pages, hours) reviewed; age gate on
- [ ] Herbal Holland Rewards rules and liability policy approved by finance
- [ ] Postiz running with Instagram, Facebook, LinkedIn, X and Threads connected; `POSTIZ_URL` / `POSTIZ_API_KEY` set; a test post scheduled and deleted
- [ ] Social profiles say "adults 18+"; the team briefed: brand, merch, stores, events and Learn only — no products for sale, prices or orders taken in DMs

## Platform
- [ ] `DEMO_MODE=false`, strong `SESSION_SECRET`, `CRON_SECRET` set, `APP_URL` correct
- [ ] Migrations applied; backups + PITR verified with a restore test
- [ ] Monitoring, alerting and on-call rota in place; runbook shared
- [ ] Load test: peak-hour POS posting and month-end reports against a production-sized dataset (`SEED_STORES=1000`,
      `scripts/bench.ts --write`)
- [ ] End-to-end journeys green against staging (`e2e/checkout.mjs`, `e2e/pos.mjs`) on the real devices (Android till,
      phone, tablet)
