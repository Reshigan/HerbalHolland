// Copies the screenshots the guide uses into docs/guide/images as JPEGs (q80, ≤ 1400 px wide), cropping the
// full-page phone captures to the part the caption talks about. Sources are the CI test-run captures.
//   node docs/guide/prepare-images.mjs
import sharp from "sharp";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "images");
mkdirSync(out, { recursive: true });

const SP = "/tmp/claude-0/-home-user-HerbalHolland/c26912e6-76cd-5c73-be4e-84ba690d1912/scratchpad";
const COM = join(here, "..", "..", "test-results", "com-shots");
const DESKTOP_W = 1100; // desktop captures are downscaled to this width (well under the 1400 px cap)
const PHONE_W = 390;

/** [output name, source path, options]. crop = { top, height } in source pixels; width = output width. */
const IMAGES = [
  // Getting in
  ["login", `${SP}/ci-shop/19-login-error.png`],
  ["pos-pair", `${SP}/ci-pos/01-pair-store.png`],
  // Shop & Rewards (phone, full-page captures cropped)
  ["shop-age-gate", `${SP}/ci-shop/01-age-gate.png`, { crop: { top: 0, height: 900 } }],
  ["shop-category", `${SP}/ci-shop/02-category.png`, { crop: { top: 0, height: 1300 } }],
  ["shop-search", `${SP}/ci-shop/03-search.png`, { crop: { top: 0, height: 1300 } }],
  ["shop-product", `${SP}/ci-shop/04-product-added.png`, { crop: { top: 640, height: 900 } }],
  ["shop-product-facts", `${SP}/ci-shop/04-product-added.png`, { crop: { top: 1470, height: 1450 } }],
  ["shop-bag", `${SP}/ci-shop/05-bag.png`, { crop: { top: 0, height: 1500 } }],
  ["shop-store-picker", `${SP}/ci-shop/06-store-picker.png`, { crop: { top: 0, height: 700 } }],
  ["checkout-signin", `${SP}/ci-checkout/03-checkout-signin.png`, { crop: { top: 0, height: 1300 } }],
  ["checkout-code", `${SP}/ci-checkout/04-checkout-code.png`, { crop: { top: 0, height: 1300 } }],
  ["checkout-register", `${SP}/ci-checkout/05-checkout-register.png`, { crop: { top: 0, height: 760 } }],
  ["checkout-consent", `${SP}/ci-checkout/05-checkout-register.png`, { crop: { top: 790, height: 1250 } }],
  ["checkout-filled", `${SP}/ci-checkout/07-checkout-filled.png`, { crop: { top: 0, height: 2200 } }],
  ["checkout-pay", `${SP}/ci-checkout/08-pay.png`, { crop: { top: 0, height: 1500 } }],
  ["order-placed", `${SP}/ci-checkout/09-order.png`, { crop: { top: 0, height: 1800 } }],
  ["order-tracking", `${SP}/ci-shop/08-order-tracking.png`, { crop: { top: 0, height: 1800 } }],
  ["tax-invoice", `${SP}/ci-shop/09-tax-invoice.png`],
  ["club-card", `${SP}/ci-shop/07-club.png`, { crop: { top: 0, height: 940 } }],
  ["club-settings", `${SP}/ci-shop/10-settings.png`, { crop: { top: 0, height: 1460 } }],
  ["club-drop-watch", `${SP}/ci-shop/11-drop-watch.png`, { crop: { top: 640, height: 900 } }],
  ["club-event-ticket", `${SP}/ci-shop/12-event-ticket.png`, { crop: { top: 0, height: 1500 } }],
  ["club-share-card", `${SP}/ci-shop/13-share-card.png`, { crop: { top: 0, height: 1300 } }],
  ["club-join-referral", `${SP}/ci-shop/14-join-referral.png`, { crop: { top: 0, height: 1500 } }],
  ["club-quest", `${SP}/ci-shop/16-quest-passed.png`, { crop: { top: 3000, height: 800 } }],
  ["club-unsubscribed", `${SP}/ci-shop/17-unsubscribed.png`],
  ["club-age-verified", `${SP}/ci-shop/18-age-verified.png`, { crop: { top: 180, height: 1300 } }],
  // Till
  ["pos-members-only", `${SP}/ci-pos/02-members-only.png`],
  ["pos-join", `${SP}/ci-pos/03-join-at-till.png`],
  ["pos-patient-basket", `${SP}/ci-pos/05-patient-basket.png`],
  ["pos-tap", `${SP}/ci-pos/06-tap-on-glass.png`],
  ["pos-patient-receipt", `${SP}/ci-pos/07-patient-receipt.png`],
  ["pos-event-checkin", `${SP}/ci-pos/08-event-checkin.png`],
  ["pos-refund", `${SP}/ci-pos/09-refund-sheet.png`],
  ["pos-credit-note", `${SP}/ci-pos/10-credit-note.png`],
  ["pos-offline", `${SP}/ci-pos/11-offline-receipt.png`],
  ["pos-orders", `${SP}/ci-pos/12-orders-board.png`],
  ["pos-handover", `${SP}/ci-pos/13-handover.png`],
  ["pos-z-report", `${SP}/ci-pos/14-z-report.png`],
  ["pos-offline-reload", `${SP}/ci-pos/15-offline-reload.png`],
  // Store back office
  ["menu-board", `${SP}/ci-backoffice/01-menu-board.png`],
  ["bo-add-member", `${SP}/ci-backoffice/02-add-member.png`],
  ["bo-member", `${SP}/ci-backoffice/03-member.png`],
  ["bo-revoke-auth", `${SP}/ci-backoffice/04-revoke-authorisation.png`],
  ["bo-write-off", `${SP}/ci-backoffice/05-write-off-lot.png`],
  ["bo-stock-take", `${SP}/ci-backoffice/06-stock-take-review.png`],
  ["bo-order-builder", `${SP}/ci-backoffice/07-order-builder.png`],
  ["bo-hq-shipped", `${SP}/ci-backoffice/08-hq-shipped.png`],
  ["bo-receive", `${SP}/ci-backoffice/09-receive.png`],
  ["bo-marketplace", `${SP}/ci-backoffice/10-marketplace.png`],
  ["bo-handover", `${SP}/ci-backoffice/11-handover.png`],
  ["bo-promotion", `${SP}/ci-backoffice/12-promotion.png`],
  ["bo-campaign", `${SP}/ci-backoffice/13-campaign-interest.png`],
  ["bo-owner", `${SP}/ci-backoffice/14-owner-consolidated.png`],
  // HQ
  ["hq-new-store", `${SP}/ci-hq/01-new-store.png`],
  ["hq-store", `${SP}/ci-hq/02-store-detail.png`],
  ["hq-product", `${SP}/ci-hq/03-product.png`],
  ["hq-import", `${SP}/ci-hq/04-catalogue-import-preview.png`],
  ["hq-batch", `${SP}/ci-hq/05-batch.png`],
  ["hq-recalled", `${SP}/ci-hq/06-recalled.png`],
  ["hq-promotion", `${SP}/ci-hq/07-promotion.png`],
  ["hq-campaign", `${SP}/ci-hq/08-campaign-reach.png`],
  ["hq-campaign-cancelled", `${SP}/ci-hq/09-campaign-cancelled.png`],
  ["hq-social", `${SP}/ci-hq/10-social.png`],
  ["hq-anonymised", `${SP}/ci-hq/11-anonymised.png`],
  ["hq-team", `${SP}/ci-hq/12-team.png`],
  ["hq-report-region", `${SP}/ci-hq/13-report-region.png`],
  ["hq-report", `${SP}/ci-hq/14-report.png`],
  ["hq-area-manager", `${SP}/ci-hq/15-area-manager.png`],
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
  ["site-franchise", `${COM}/franchise-1440-top.png`],
  ["site-press", `${COM}/press-1440-top.png`],
  ["site-press-release", `${COM}/press-release-1440.png`],
  ["site-careers", `${COM}/careers-1440-top.png`],
  ["site-contact", `${COM}/contact-1440-top.png`],
  ["site-privacy", `${COM}/privacy-1440-top.png`],
  ["site-terms", `${COM}/terms-1440-top.png`],
  ["site-paia", `${COM}/paia-1440-top.png`],
  ["site-under-18", `${COM}/nope-1440-top.png`],
  ["site-menu-phone", `${COM}/menu-390.png`],
];

let total = 0;
for (const [name, src, opts = {}] of IMAGES) {
  if (!existsSync(src)) {
    console.error("missing", src);
    process.exitCode = 1;
    continue;
  }
  let img = sharp(src);
  const meta = await img.metadata();
  if (opts.crop) {
    const height = Math.min(opts.crop.height, meta.height - opts.crop.top);
    img = img.extract({ left: 0, top: opts.crop.top, width: meta.width, height });
  }
  const width = Math.min(opts.width ?? (meta.width <= 500 ? PHONE_W : DESKTOP_W), meta.width, 1400);
  const info = await img.resize({ width, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(join(out, `${name}.jpg`));
  total += info.size;
  console.log(`${name}.jpg ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
}
console.log(`total ${Math.round(total / 1024)} KB in ${IMAGES.length} images`);
