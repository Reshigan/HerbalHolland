# Launch checklist

Tick every line before the first store trades on the platform.

## Legal & compliance
- [ ] Counsel sign-off: MEDICAL-mode flows, class × channel matrix, storefront visibility of licensed products, claims library
- [ ] SAHPRA licence details captured per store (`licences`, `licenceRef`); dispensers designated and trained
- [ ] Patient-authorisation intake procedure and document storage agreed
- [ ] CBD master data validated (≤ 600 mg/pack, ≤ 20 mg/day, approved claims, COAs per batch)
- [ ] Information Officer registered; privacy notice, PAIA manual, terms and returns policy (incl. ECTA cooling-off) published
- [ ] NCC direct-marketing registration done; first opt-out registry import loaded
- [ ] Franchise agreements reference the separate marketing fund and statement settlement

## Money
- [ ] Each store onboarded with its acquirer (honest MCC, written approval for the product mix) and Halo Dot merchant ID
- [ ] Online gateway chosen per acceptable-use policy; webhooks tested; PayShap/EFT rails live
- [ ] VAT numbers per franchisee captured (non-vendors marked); invoice templates checked against SARS requirements
- [ ] Royalty / levy / e-commerce commission rates confirmed per store; first statement dry-run reconciled
- [ ] Accounting export (Sage/Xero daily journal) agreed with each owner's bookkeeper

## Stock
- [ ] Catalogue, variants, barcodes (GS1 600-prefix) and RRPs loaded; ranging by format
- [ ] Opening stock counted per store (full blind stock take) and approved
- [ ] DC replenishment cadence and lead times set; par/reorder levels reviewed

## Devices & people
- [ ] Android devices (11+, Google services, no developer options) paired per till; printers tested; barcode scanners tested
- [ ] Staff accounts with PINs; managers with passwords; area managers assigned to regions
- [ ] Training: POS (sale, split tenders, offline, refunds), handover with ID checks, stock takes, receiving, recalls

## Customer channels
- [ ] SMS and email providers live (`SMTP_URL`, `MESSAGING_PROVIDER`); sender footer details correct
- [ ] Storefront content (Learn articles, store pages, hours) reviewed; age gate on
- [ ] Herbal Holland Rewards rules and liability policy approved by finance

## Platform
- [ ] `DEMO_MODE=false`, strong `SESSION_SECRET`, `CRON_SECRET` set, `APP_URL` correct
- [ ] Migrations applied; backups + PITR verified with a restore test
- [ ] Monitoring, alerting and on-call rota in place; runbook shared
- [ ] Load test: peak-hour POS posting and month-end reports against a production-sized dataset (`SEED_STORES=1000`,
      `scripts/bench.ts --write`)
- [ ] End-to-end journeys green against staging (`e2e/checkout.mjs`, `e2e/pos.mjs`) on the real devices (Android till,
      phone, tablet)
