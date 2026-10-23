// Fills a fresh network with what the repository already knows, and nothing invented: the shop's categories
// (prisma/seed-data), each store's map position and the company's address book from the brand site's facts
// (sites/herbalholland.com/facts.ts), and the house accessories range (docs/catalogue/accessories-range.csv) imported the
// way HQ → Catalogue → Import does it (products stay as the file says, DRAFT until HQ sets them live). Idempotent: run
// it again and nothing changes. Addresses, phones, hours and licences stay for HQ → Stores.
//   DATABASE_URL=file:… npx tsx scripts/fill-launch.ts            (a local file)
//   CLOUDFLARE_D1_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_DATABASE_ID=… npx tsx scripts/fill-launch.ts   (the live D1)
import "dotenv/config";
import { readFileSync } from "node:fs";
import { scriptDb, describeDb } from "./_d1";
import { audit, SYSTEM } from "@/server/audit";
import { CATEGORIES } from "../prisma/seed-data";
import { FACTS } from "../sites/herbalholland.com/facts";
import { planImport, readImport } from "@/lib/catalogue-import";
import { loadSnapshot } from "@/server/hq/catalogue-import";
import { DEFAULT_COMPLIANCE } from "@/lib/compliance";

const CSV = "docs/catalogue/accessories-range.csv";
// The brand site's store keys against the network's store codes.
const STORE_CODE: Record<string, string> = { pietermaritzburg: "PMB01", bluff: "DBN01", hillcrest: "HIL01", hilton: "HLT01" };

async function main() {
  const db = await scriptDb();
  console.log(`Filling ${describeDb()}`);

  // Categories, in the shop's order.
  let cats = 0;
  for (const [i, c] of CATEGORIES.entries()) {
    const had = await db.category.findUnique({ where: { slug: c.slug }, select: { id: true } });
    if (had) continue;
    await db.category.create({ data: { slug: c.slug, name: c.name, icon: c.icon, blurb: c.blurb, sortOrder: i } });
    cats++;
  }
  console.log(`categories: ${cats} added, ${CATEGORIES.length - cats} already there`);

  // Where each store is (the map and the store finder), from the site's facts: a town-centre point, so only for a store
  // without a street address yet (one with an address is better served by "Directions" searching that address); nothing
  // HQ has typed is touched.
  let placed = 0;
  for (const s of FACTS.stores) {
    const code = STORE_CODE[s.key];
    if (!code) continue;
    const st = await db.store.findUnique({ where: { code }, select: { id: true, lat: true, lng: true, addressLine: true } });
    if (!st || (st.lat != null && st.lng != null) || st.addressLine) continue;
    await db.store.update({ where: { id: st.id }, data: { lat: s.lat, lng: s.lon } });
    placed++;
  }
  console.log(`stores placed on the map: ${placed}`);

  // The franchisor's address book: the public contact address from the site (ECT Act s43 details stay for HQ).
  const hq = await db.company.findFirst({ where: { kind: "FRANCHISOR" }, select: { id: true, email: true } });
  if (hq && !hq.email) {
    await db.company.update({ where: { id: hq.id }, data: { email: FACTS.email.hello } });
    console.log(`company email: ${FACTS.email.hello}`);
  }

  // The accessories range, through the same read → snapshot → plan the HQ import uses, written the same way.
  const text = readFileSync(CSV, "utf8");
  const read = readImport(text);
  const snap = await loadSnapshot(db, read, null, DEFAULT_COMPLIANCE.licensedOnly); // a fresh network runs on the default rules
  const plan = planImport(read, snap);
  if (plan.fileErrors.length) throw new Error(plan.fileErrors.join(" "));
  for (const w of plan.warnings) console.log(`  ! ${w}`);
  const c = plan.counts;
  if (!c.productsNew && !c.variantsNew && !c.variantsUpdated && !plan.products.some((p) => p.id && p.changed.length)) {
    console.log(`catalogue: ${CSV} already imported (${c.unchanged} rows unchanged, ${c.errors} with errors)`);
    return;
  }
  const productId = new Map<string, string>();
  for (const p of plan.products.filter((p) => !p.id)) {
    const row = await db.product.create({ data: { ...p.data, slug: p.slug }, select: { id: true } });
    productId.set(p.slug, row.id);
  }
  const pick = <T extends object>(o: T, keys: string[]) => Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k]]));
  for (const p of plan.products) if (p.id && p.changed.length) await db.product.update({ where: { id: p.id }, data: pick(p.data, p.changed) });
  for (const v of plan.variants.filter((v) => !v.id)) await db.variant.create({ data: { ...v.data, productId: v.productId ?? productId.get(v.productKey)!, sortOrder: v.sortOrder } });
  for (const v of plan.variants) if (v.id && v.changed.length) await db.variant.update({ where: { id: v.id }, data: pick(v.data, v.changed) });
  await audit(db, SYSTEM, "catalogue.import", {
    entity: "Upload", entityId: "scripts/fill-launch.ts",
    data: { file: CSV, rows: c.rows, created: { products: c.productsNew, variants: c.variantsNew }, updated: { products: c.productsUpdated, variants: c.variantsUpdated }, unchanged: c.unchanged, skipped: c.errors },
  });
  const updated = plan.products.filter((p) => p.id && p.changed.length).length;
  console.log(`catalogue: ${c.productsNew} products and ${c.variantsNew} variants added, ${updated}/${c.variantsUpdated} updated, ${c.errors} rows skipped (${CSV})`);
  for (const r of plan.rows.filter((r) => r.errors.length).slice(0, 10)) console.log(`  row ${r.line}: ${r.errors.join("; ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
