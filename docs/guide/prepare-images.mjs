// Copies the screenshots the guide uses into docs/guide/images as JPEGs (q80, ≤ 1400 px wide), cropping the
// full-page phone captures to the part the caption talks about. Sources are the CI journey captures (resolved by
// name, since the journeys number their screenshots as they go), the member, admin, till-hardware, operations and
// document captures under test-results/, and the herbalholland.com captures.
//   node docs/guide/prepare-images.mjs [name prefix …]   (only the images whose names start with one of them)
import sharp from "sharp";
import { mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "images");
mkdirSync(out, { recursive: true });

const SP = "/tmp/claude-0/-home-user-HerbalHolland/c26912e6-76cd-5c73-be4e-84ba690d1912/scratchpad";
const T = join(here, "..", "..", "test-results");
const COM = join(T, "com-shots"); // herbalholland.com
const SHOP = join(T, "shop-shots"); // the member journeys at 390 wide (phone-NN-*.png) and 1440 (desktop-NN-*.png)
const ADMIN = join(T, "admin-shots"); // back office and HQ pages, desktop and phone
const MADMIN = join(T, "m-admin"); // the admin conveniences: palette, cheat sheet, saved view, inline edits, message drawer
const TILL = join(T, "till-shots"); // e2e/till-hardware.mjs: printer, customer display, training mode, quiet hours
const OPS = join(T, "ops-shots"); // Today list, supplier invoices, forecast order, opening checklist, cohorts
const DOCS = join(T, "docs-shots"); // rendered documents: invoices, statements, Z-reports, emails, menu board
const BOOKS = join(T, "books-shots"); // the books: overview, journals, banking, reports, VAT, month end, settings
const DESKTOP_W = 1100; // desktop captures are downscaled to this width (well under the 1400 px cap)
const PHONE_W = 390;

/**
 * A journey capture by the name it was saved under (e.g. "club" → 07-club.png). The journeys prefix each screenshot
 * with a running number, so the prefix shifts whenever a step is added, and an older run's files stay in the folder:
 * the newest file with that name wins.
 */
function ci(journey, name) {
  const dir = join(SP, `ci-${journey}`);
  const fallback = join(dir, `NN-${name}.png`);
  if (!existsSync(dir)) return fallback;
  const re = new RegExp(`^\\d+-${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.png$`);
  const found = readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t || b.f.localeCompare(a.f));
  return found.length ? join(dir, found[0].f) : fallback;
}

/** [output name, source path, options]. crop = { top, height } in source pixels; width = output width. */
const IMAGES = [
  // Getting in
  ["login", ci("shop", "login-error")],
  ["pos-pair", ci("pos", "pair-store")],
  // Shop & Rewards (phone, full-page captures cropped)
  ["shop-age-gate", ci("shop", "age-gate"), { crop: { top: 0, height: 900 } }],
  ["shop-home-hero", `${SHOP}/phone-01-home.png`, { crop: { top: 0, height: 1300 } }],
  ["shop-home-new", `${SHOP}/phone-01-home.png`, { crop: { top: 2650, height: 1250 } }],
  ["shop-home-gift", `${SHOP}/phone-01-home.png`, { crop: { top: 3900, height: 1000 } }],
  ["shop-category", `${SHOP}/phone-02-shop_category_wellness.png`, { crop: { top: 0, height: 1300 } }],
  ["shop-search", ci("shop", "search"), { crop: { top: 0, height: 1300 } }],
  ["shop-store-picker", ci("shop", "store-picker"), { crop: { top: 0, height: 700 } }],
  ["shop-product", `${SHOP}/phone-04-p_calm_cbd_oil_600.png`, { crop: { top: 150, height: 1150 } }],
  ["shop-product-facts", `${SHOP}/phone-04-p_calm_cbd_oil_600.png`, { crop: { top: 1290, height: 1180 } }],
  ["shop-product-coa", `${SHOP}/phone-04-p_calm_cbd_oil_600.png`, { crop: { top: 2470, height: 1120 } }],
  ["shop-product-reviews", `${SHOP}/phone-04-p_calm_cbd_oil_600.png`, { crop: { top: 4260, height: 980 } }],
  ["shop-bag", `${SHOP}/phone-07-cart.png`, { crop: { top: 130, height: 1100 } }],
  ["checkout-signin", ci("checkout", "checkout-signin"), { crop: { top: 0, height: 1300 } }],
  ["checkout-code", ci("checkout", "checkout-code"), { crop: { top: 0, height: 1300 } }],
  ["checkout-register", ci("checkout", "checkout-register"), { crop: { top: 0, height: 760 } }],
  ["checkout-consent", ci("checkout", "checkout-register"), { crop: { top: 790, height: 1250 } }],
  ["checkout-filled", `${SHOP}/phone-08-checkout.png`, { crop: { top: 150, height: 1150 } }],
  ["checkout-summary", `${SHOP}/phone-08-checkout.png`, { crop: { top: 1300, height: 1130 } }],
  ["checkout-pay", ci("checkout", "pay"), { crop: { top: 0, height: 1500 } }],
  ["order-placed", ci("checkout", "order"), { crop: { top: 0, height: 1800 } }],
  ["order-tracking", `${SHOP}/phone-09-orders_NCRVBB.png`, { crop: { top: 130, height: 1180 } }],
  ["order-delivery", `${SHOP}/phone-09-orders_NCRVBB.png`, { crop: { top: 1330, height: 920 } }],
  ["tax-invoice", ci("shop", "tax-invoice")],
  ["shop-support", ci("shop", "support-form"), { crop: { top: 0, height: 1200 } }],
  ["shop-support-ticket", ci("shop", "support-ticket"), { crop: { top: 130, height: 640 } }],
  ["shop-return-form", ci("shop", "return-form"), { crop: { top: 150, height: 700 } }],
  ["shop-return-requested", ci("shop", "return-requested"), { crop: { top: 130, height: 650 } }],
  ["club-card", ci("shop", "club"), { crop: { top: 0, height: 940 } }],
  ["club-more", `${SHOP}/phone-10-club.png`, { crop: { top: 1440, height: 900 } }],
  ["club-wishlist", ci("shop", "wishlist"), { crop: { top: 0, height: 770 } }],
  ["club-reminders", ci("shop", "reminders"), { crop: { top: 0, height: 770 } }],
  ["shop-gift", `${SHOP}/phone-06-gift.png`, { crop: { top: 130, height: 1170 } }],
  ["club-vouchers", `${SHOP}/phone-13-club_vouchers.png`, { crop: { top: 130, height: 640 } }],
  ["club-addresses", `${SHOP}/phone-14-club_addresses.png`, { crop: { top: 130, height: 640 } }],
  ["club-settings", ci("shop", "settings"), { crop: { top: 0, height: 1460 } }],
  ["club-drop-watch", ci("shop", "drop-watch"), { crop: { top: 700, height: 840 } }],
  ["club-event-ticket", ci("shop", "event-ticket"), { crop: { top: 0, height: 1500 } }],
  ["club-share-card", ci("shop", "share-card"), { crop: { top: 0, height: 1300 } }],
  ["club-join-referral", ci("shop", "join-referral"), { crop: { top: 0, height: 1500 } }],
  ["club-quest", ci("shop", "quest-passed"), { crop: { top: 3000, height: 800 } }],
  ["club-unsubscribed", ci("shop", "unsubscribed")],
  ["club-age-verified", ci("shop", "age-verified"), { crop: { top: 1990, height: 560 } }],
  // Till
  ["pos-members-only", ci("pos", "members-only")],
  ["pos-join", ci("pos", "join-at-till")],
  ["pos-patient-basket", ci("pos", "patient-basket")],
  ["pos-tap", ci("pos", "tap-on-glass")],
  ["pos-patient-receipt", ci("pos", "patient-receipt")],
  ["pos-event-checkin", ci("pos", "event-checkin")],
  ["pos-refund", ci("pos", "refund-sheet")],
  ["pos-credit-note", ci("pos", "credit-note")],
  ["pos-offline", ci("pos", "offline-receipt")],
  ["pos-orders", ci("pos", "orders-board")],
  ["pos-handover", ci("pos", "handover")],
  ["pos-z-report", ci("pos", "z-report")],
  ["pos-offline-reload", ci("pos", "offline-reload")],
  ["pos-printer", `${TILL}/01-printer-setup.png`],
  ["pos-voucher-tender", join(T, "till-voucher-shots", "voucher-tender.png")],
  // Trade channel
  ["trade-landing", join(T, "trade-final-shots", "trade-landing.png"), { crop: { top: 0, height: 1500 } }],
  ["trade-apply", join(T, "trade-licence-shots", "trade-apply.png"), { crop: { top: 0, height: 1800 } }],
  ["trade-apply-licences", join(T, "trade-licence-shots", "trade-apply-licences.png")],
  ["hq-trade-licence", ci("hq", "trade-licence")],
  ["hq-trade-approve", ci("hq", "trade-approve")],
  ["trade-range", join(T, "trade-final-shots", "trade-range-phone.png"), { crop: { top: 0, height: 1900 } }],
  ["trade-checkout", join(T, "a-trade", "07-checkout-collect.png"), { crop: { top: 60, height: 1140 } }],
  ["trade-statement", join(T, "trade-final-shots", "trade-statement.png"), { crop: { top: 0, height: 1500 } }],
  ["hq-trade-overview", join(T, "trade-final-shots", "hq-trade-overview.png"), { crop: { top: 0, height: 1100 } }],
  ["hq-trade-account", join(T, "trade-final-shots", "hq-trade-account.png"), { crop: { top: 0, height: 1100 } }],
  ["hq-trade-ledger", join(T, "trade-final-shots", "hq-trade-ledger.png"), { crop: { top: 0, height: 1100 } }],
  ["hq-trade-order-ship", join(T, "b-hq", "14-trade-ship.png")],
  ["store-trade-handover", join(T, "trade-final-shots", "store-trade-handover.png"), { crop: { top: 0, height: 1000 } }],
  ["pos-trade-sale", join(T, "till-trade-shots", "trade-basket.png")],
  ["hq-report-trade-sales", join(T, "f2-shots", "trade-03-hq-report-trade-sales.png"), { crop: { top: 0, height: 1100 } }],
  ["pos-voucher-refund", join(T, "till-voucher-shots", "voucher-refund-sheet.png")],
  ["pos-display-link", `${TILL}/06-display-link.png`],
  ["pos-display-sale", `${TILL}/03-display-sale.png`],
  ["pos-display-done", `${TILL}/05-display-done.png`],
  ["pos-training-tour", `${TILL}/08-training-tour.png`],
  ["pos-training-receipt", `${TILL}/09-training-receipt.png`],
  ["pos-quiet", `${TILL}/10-quiet-hours.png`],
  ["pos-scanner", `${TILL}/11-camera-scanner.png`],
  // Store back office
  ["menu-board", ci("backoffice", "menu-board")],
  ["bo-today", ci("backoffice", "today-list")],
  ["bo-manager-overview", `${ADMIN}/store-manager-overview-desktop.png`, { crop: { top: 0, height: 1000 } }],
  ["bo-owner-overview", `${ADMIN}/store-owner-overview-desktop.png`, { crop: { top: 0, height: 1000 } }],
  ["bo-add-member", ci("backoffice", "add-member")],
  ["bo-member", ci("backoffice", "member")],
  ["bo-revoke-auth", ci("backoffice", "revoke-authorisation")],
  ["bo-write-off", ci("backoffice", "write-off-lot")],
  ["bo-stock-take", ci("backoffice", "stock-take-review")],
  ["bo-order-builder", `${OPS}/04-_store_PTA01_purchasing_new.png`],
  ["bo-hq-shipped", ci("backoffice", "hq-shipped")],
  ["bo-receive", ci("backoffice", "receive")],
  ["bo-marketplace", ci("backoffice", "marketplace")],
  ["bo-handover", ci("backoffice", "handover")],
  ["bo-promotion", ci("backoffice", "promotion")],
  ["bo-campaign", ci("backoffice", "campaign-interest")],
  ["bo-owner", ci("backoffice", "owner-consolidated")],
  ["bo-supplier-invoices", `${OPS}/03-_store_PTA01_finance_supplier_invoices.png`],
  ["bo-settings", `${MADMIN}/06-inline-hours.png`],
  ["bo-team-pin", `${MADMIN}/05-inline-pin.png`],
  ["bo-palette", `${ADMIN}/command-palette-desktop.png`],
  ["bo-cheat-sheet", `${ADMIN}/cheat-sheet-desktop.png`],
  ["bo-inline-price", `${ADMIN}/inline-edit-price-desktop.png`],
  ["bo-saved-view", `${MADMIN}/03-saved-view.png`],
  // HQ
  ["hq-overview", `${ADMIN}/hq-overview-desktop.png`, { crop: { top: 0, height: 1000 } }],
  ["hq-region-overview", `${ADMIN}/hq-area-manager-desktop.png`, { crop: { top: 0, height: 1000 } }],
  ["hq-new-store", ci("hq", "new-store")],
  ["hq-store", ci("hq", "store-detail")],
  ["hq-checklist", `${OPS}/07-_hq_stores_GRJ01.png`, { crop: { top: 590, height: 760 } }],
  ["hq-stores-progress", ci("hq", "store-checklist")],
  ["hq-product", ci("hq", "product")],
  ["hq-inline-rrp", `${MADMIN}/07-hq-inline-rrp.png`],
  ["hq-import", ci("hq", "catalogue-import-preview")],
  ["hq-batch", ci("hq", "batch")],
  ["hq-recalled", ci("hq", "recalled")],
  ["hq-promotion", ci("hq", "promotion")],
  ["hq-campaign", ci("hq", "campaign-reach")],
  ["hq-campaign-cancelled", ci("hq", "campaign-cancelled")],
  ["hq-social", ci("hq", "social")],
  ["hq-studio", ci("hq", "studio")],
  ["hq-messages", `${ADMIN}/hq-messages-desktop.png`, { crop: { top: 0, height: 1000 } }],
  ["hq-message-drawer", `${MADMIN}/08-message-drawer.png`],
  ["hq-anonymised", ci("hq", "anonymised")],
  ["hq-team", ci("hq", "team")],
  ["hq-report-region", ci("hq", "report-region")],
  ["hq-report", ci("hq", "report")],
  ["hq-cohorts", `${OPS}/09-_hq_reports_cohorts_range_90d.png`],
  ["hq-retention", `${OPS}/10-_hq_reports_retention_range_90d.png`, { crop: { top: 0, height: 1100 } }],
  ["hq-area-manager", ci("hq", "area-manager")],
  // Documents
  ["doc-invoice-slip", `${DOCS}/invoice-print-receipt-80mm.png`],
  ["doc-statement", `${DOCS}/statement-store-print-portrait.png`],
  ["doc-z-report", `${DOCS}/z-report-print-receipt-80mm.png`],
  // herbalholland.com
  ["site-gate", `${COM}/gate-1440-1.png`],
  ["site-home-polder", `${COM}/home-1440-1-polder.png`],
  ["site-home-sea", `${COM}/home-1440-2-sea-2.png`],
  ["site-home-hills", `${COM}/home-1440-3-hills.png`],
  ["site-home-stores", `${COM}/home-1440-4-stores.png`],
  ["site-home-range", `${COM}/home-1440-5-range.png`],
  ["site-home-access", `${COM}/home-1440-8-first-access.png`],
  ["site-access-done", `${COM}/early-access-home-1440-3-done.png`],
  ["site-about", `${COM}/about-1440-top.png`],
  ["site-stores-map", `${COM}/stores-1440-list-map.png`],
  ["site-stores-concept", `${COM}/stores-1440-concept.png`],
  ["site-store-hillcrest", `${COM}/stores-hillcrest-1440-top.png`],
  ["site-press", `${COM}/press-1440-top.png`],
  ["site-press-release", `${COM}/press-release-1440.png`],
  ["site-careers", `${COM}/careers-1440-top.png`],
  ["site-contact", `${COM}/contact-1440-top.png`],
  ["site-privacy", `${COM}/privacy-1440-top.png`],
  ["site-terms", `${COM}/terms-1440-top.png`],
  ["site-paia", `${COM}/paia-1440-top.png`],
  ["site-under-18", `${COM}/nope-1440-top.png`],
  ["site-menu-phone", `${COM}/menu-390.png`],
  // The books
  ...["overview", "index", "journal-new", "journal-draft", "bank", "reconcile", "trial-balance", "income", "vat", "close", "settings"].map((n) => [`books-${n}`, `${BOOKS}/books-${n}.png`]),
  ["hq-statement-payments", `${BOOKS}/hq-statement-payments.png`],
];
const only = process.argv.slice(2);

let total = 0;
for (const [name, src, opts = {}] of IMAGES.filter(([n]) => !only.length || only.some((o) => n.startsWith(o)))) {
  if (!existsSync(src)) {
    console.error("missing", src);
    process.exitCode = 1;
    continue;
  }
  let img = sharp(src);
  const meta = await img.metadata();
  if (opts.crop) {
    if (opts.crop.top >= meta.height) {
      console.error(`crop starts below the image: ${name} (${meta.height} px tall, crop at ${opts.crop.top})`);
      process.exitCode = 1;
      continue;
    }
    const height = Math.min(opts.crop.height, meta.height - opts.crop.top);
    img = img.extract({ left: 0, top: opts.crop.top, width: meta.width, height });
  }
  const width = Math.min(opts.width ?? (meta.width <= 500 ? PHONE_W : DESKTOP_W), meta.width, 1400);
  const info = await img.resize({ width, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(join(out, `${name}.jpg`));
  total += info.size;
  console.log(`${name}.jpg ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB  ← ${basename(src)}`);
}
console.log(`total ${Math.round(total / 1024)} KB in ${IMAGES.length} images`);
