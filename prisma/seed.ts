// Demo network generator. Simulates DAYS of trading across the store network with
// the same rules the platform enforces (FEFO, licences, medical authorisations,
// s18A incentive exclusions, loyalty, promotions), plus the trade (wholesale)
// channel: accounts, portal orders, till trade sales and the trade ledger. It
// writes rollups from the same records, so every report reconciles.
//
//   npm run db:seed                      # 24 named stores, 60 days
//   SEED_DAYS=90 SEED_STORES=200 npm run db:seed   # scale test (synthetic stores)
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSecret } from "../src/server/crypto";
import { DEMO_PASSWORD } from "../src/lib/password";
import { allocate } from "../src/lib/fefo";
import { pointsFor, tierFor, DEFAULT_TIER_SAVINGS, POINT_VALUE_CENTS, type TierKey } from "../src/lib/loyalty-rules";
import { vatOf } from "../src/lib/money";
import { addDays, dayKey } from "../src/lib/format";
import { statementTerms } from "../src/lib/supplier-invoice-rules";
import { bankBy, cashToBank } from "../src/lib/banking";
import { applyPromotions, type PromoInput } from "../src/lib/promotions";
import { promoWindowOpen } from "../src/lib/pricing-rules";
import { appendNote, leadNumber, noteLine, type LeadStatusKey } from "../src/lib/leads";
import { DEFAULT_COMPLIANCE, DEFAULT_LEGAL_BASIS, PRODUCT_FACTS, CBD_CLASSES, THC_CAP_PCT, incentiveExcluded, type RegClass } from "../src/lib/compliance";
import { eftReference, previousMonth, statementMonth, tradeAccountNumber, tradeBuyerBlock, tradeCreditNumber, tradeDelivery, tradeHandling, tradeInvoiceNumber, tradeLine, tradeOrderNumber, tradeStatement, tradeTotals, TRADE_CLASSES, vatHalfUp } from "../src/lib/trade";
import { expiryOf, LICENCE_REMIND_DAYS, requiredLicences, TRADE_LICENCES, type TradeLicenceKind } from "../src/lib/trade-licences";
import { CATEGORIES, DCS, FIRST_NAMES, HQ_COMPANY, LAST_NAMES, OWNERS, PRODUCTS, REGIONS, STORES, type StoreSeed } from "./seed-data";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// ── Deterministic randomness ───────────────────────────────────────────────
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = mulberry32(Number(process.env.SEED ?? 20260927));
const rand = (a: number, b: number) => a + R() * (b - a);
const int = (a: number, b: number) => Math.floor(rand(a, b + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(R() * xs.length)];
const chance = (p: number) => R() < p;
function weighted<T>(pairs: readonly (readonly [T, number])[]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let x = R() * total;
  for (const [v, w] of pairs) if ((x -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
}
const uid = () => randomUUID();

// ── Time ─────────────────────────────────────────────────────────────────
const NOW = new Date();
const DAYS = Math.max(21, Number(process.env.SEED_DAYS ?? 60));
const DAY = 86_400_000;
const keyOf = (offset: number) => dayKey(new Date(NOW.getTime() - offset * DAY));
const dayKeys = Array.from({ length: DAYS }, (_, i) => keyOf(DAYS - 1 - i));
const TODAY = dayKeys[dayKeys.length - 1];
const midnight = (k: string) => new Date(`${k}T00:00:00+02:00`);
const at = (k: string, minutes: number) => new Date(midnight(k).getTime() + minutes * 60_000);
const weekday = (k: string) => new Date(`${k}T12:00:00Z`).getUTCDay();
const nowMinutes = Math.floor((NOW.getTime() - midnight(TODAY).getTime()) / 60_000);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const dateOnly = (k: string) => new Date(`${k}T00:00:00Z`);

// ── Bulk insert ───────────────────────────────────────────────────────────
async function insert<T>(label: string, model: { createMany: (a: { data: T[] }) => Promise<unknown> }, rows: T[], chunk = 4000) {
  for (let i = 0; i < rows.length; i += chunk) await model.createMany({ data: rows.slice(i, i + chunk) });
  console.log(`  ${label.padEnd(22)} ${rows.length.toLocaleString()}`);
}

/** A one-page A4 PDF of lines in Helvetica ([size, bold, text, grey 0–1]): the demo's stand-in for a scanned document. */
function samplePdf(lines: [size: number, bold: boolean, text: string, grey: number][]): Uint8Array<ArrayBuffer> {
  const WIN: Record<string, string> = { "\u2014": "\\227", "\u2013": "\\226", "\u2019": "\\222" };
  const esc = (t: string) => [...t].map((c) => WIN[c] ?? ("()\\".includes(c) ? `\\${c}` : c.charCodeAt(0) < 127 ? c : c.charCodeAt(0) <= 255 ? `\\${c.charCodeAt(0).toString(8)}` : "?")).join("");
  let y = 760;
  const text = lines.map(([size, bold, t, grey]) => `BT ${grey} g /F${bold ? 2 : 1} ${size} Tf 72 ${(y -= size * 2)} Td (${esc(t)}) Tj ET`);
  const body = ["0.8 G 1 w 48 48 499 746 re S", ...text].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, o] of objs.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

/** Marks a database the seed made, so it can be seeded again; any other database with users is refused. */
const SEED_MARK = "demo.seeded";

/** Seeding deletes every table: run only on an empty database, one this seed made, or with --wipe=<database name>. */
async function assertDemoDatabase() {
  const [{ name }] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (process.argv.includes(`--wipe=${name}`) || (await db.user.count()) === 0 || (await db.setting.count({ where: { key: SEED_MARK } }))) return;
  throw new Error(`Refusing to seed "${name}": it holds data the demo seed didn't make, and seeding deletes everything. To wipe it anyway, add --wipe=${name}`);
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) throw new Error("Refusing to seed in production (pass --force)");
  await assertDemoDatabase();
  console.log(`Seeding Herbal Holland demo network: ${DAYS} days to ${TODAY}`);
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.setting.create({ data: { key: SEED_MARK, value: { at: new Date().toISOString() } } });

  // ── Network ─────────────────────────────────────────────────────────────
  const hq = { id: uid(), kind: "FRANCHISOR" as const, ...HQ_COMPANY, vatCategory: "B" };
  const regionId = Object.fromEntries(REGIONS.map((r) => [r.code, uid()]));
  const companies: Prisma.CompanyCreateManyInput[] = [hq];
  const companyId: Record<string, string> = {};
  for (const o of OWNERS) {
    companyId[o.key] = uid();
    companies.push({ id: companyId[o.key], kind: "FRANCHISEE", name: o.legalName.replace(" (Pty) Ltd", ""), legalName: o.legalName, contactName: o.contact, email: o.email, vatNumber: o.vat, vatCategory: o.vat ? "B" : null, phone: `0${int(10, 87)} ${int(100, 999)} ${int(1000, 9999)}`, regNumber: `20${int(15, 24)}/${int(100000, 999999)}/07` });
  }

  // Optional synthetic stores for scale testing.
  const CITIES = [["Pretoria", "GP", "GPN"], ["Johannesburg", "GP", "GPS"], ["Cape Town", "WC", "WC"], ["Durban", "KZN", "KZN"], ["Gqeberha", "EC", "INT"], ["Bloemfontein", "FS", "INT"], ["Polokwane", "LP", "INT"], ["Rustenburg", "NW", "GPN"], ["Kimberley", "NC", "INT"]] as const;
  const extra = Math.max(0, Number(process.env.SEED_STORES ?? 0) - STORES.length);
  const synthetic: StoreSeed[] = Array.from({ length: extra }, (_, i) => {
    const [city, province, region] = pick(CITIES);
    const owner = `syn${Math.floor(i / 3)}`;
    if (!companyId[owner]) {
      companyId[owner] = uid();
      companies.push({ id: companyId[owner], kind: "FRANCHISEE", name: `Franchisee ${Math.floor(i / 3) + 1}`, legalName: `Franchisee ${Math.floor(i / 3) + 1} (Pty) Ltd`, vatNumber: `49${String(i).padStart(8, "0")}`, vatCategory: "B", email: `owner${Math.floor(i / 3) + 1}@example.co.za` });
    }
    return { code: `S${String(i + 1).padStart(4, "0")}`, slug: `store-${i + 1}`, name: `${city} ${i + 1}`, owner, region, dc: region === "WC" ? "DC-WC" : region === "KZN" ? "DC-KZN" : "DC-GP", format: weighted([["STANDARD", 6], ["EXPRESS", 3], ["FLAGSHIP", 1]] as const), addressLine: `${int(1, 400)} Main Road`, suburb: "Central", city, province, postalCode: String(int(1000, 9999)), lat: -26 + rand(-4, 4), lng: 26 + rand(-6, 6) };
  });

  const HOURS = { mon: ["09:00", "20:00"], tue: ["09:00", "20:00"], wed: ["09:00", "20:00"], thu: ["09:00", "20:00"], fri: ["09:00", "20:00"], sat: ["09:00", "20:00"], sun: ["10:00", "16:00"] };
  type SimStore = {
    id: string; code: string; slug: string; name: string; kind: "RETAIL" | "WAREHOUSE"; status: "ACTIVE" | "OPENING_SOON"; format: "FLAGSHIP" | "STANDARD" | "EXPRESS";
    regionCode: string; city: string; province: string; sameDay: boolean; vendor: boolean; companyKey: string; dcCode?: string;
    staff: { id: string; name: string; canDispense: boolean; role: "MANAGER" | "BUDTENDER" }[]; deviceId: string; seq: number; members: number; walkIns: number;
  };
  const stores: SimStore[] = [];
  const storeRows: Prisma.StoreCreateManyInput[] = [];
  const dcId: Record<string, string> = {};
  for (const d of DCS) {
    dcId[d.code] = uid();
    storeRows.push({ id: dcId[d.code], code: d.code, slug: d.slug, name: d.name, kind: "WAREHOUSE", status: "ACTIVE", format: "STANDARD", companyId: hq.id, regionId: regionId[d.region], addressLine: d.addressLine, suburb: d.suburb, city: d.city, province: d.province, postalCode: d.postalCode, lat: d.lat, lng: d.lng, clickCollect: false, sameDay: false, licences: ["THC"], licenceRef: `SAHPRA 22C licence (DC, demo ref)`, email: `${d.slug}@herbalholland.com`, phone: "012 004 4200", openedAt: daysAgo(400) });
    stores.push({ id: dcId[d.code], code: d.code, slug: d.slug, name: d.name, kind: "WAREHOUSE", status: "ACTIVE", format: "STANDARD", regionCode: d.region, city: d.city, province: d.province, sameDay: false, vendor: true, companyKey: "hq", staff: [], deviceId: "", seq: 0, members: 0, walkIns: 0 });
  }
  for (const s of [...STORES, ...synthetic]) {
    const id = uid();
    const owner = OWNERS.find((o) => o.key === s.owner);
    const vendor = owner ? owner.vat !== null : true;
    const status = s.status ?? "ACTIVE";
    storeRows.push({
      id, code: s.code, slug: s.slug, name: s.name, kind: "RETAIL", status, format: s.format, companyId: companyId[s.owner], regionId: regionId[s.region], dcId: dcId[s.dc],
      addressLine: s.addressLine, suburb: s.suburb, city: s.city, province: s.province, postalCode: s.postalCode, lat: s.lat, lng: s.lng,
      phone: `0${int(10, 87)} ${int(100, 999)} ${int(1000, 9999)}`, whatsapp: `+2771${int(1000000, 9999999)}`, email: `${s.slug}@herbalholland.com`, hours: HOURS,
      clickCollect: status === "ACTIVE", sameDay: !!s.sameDay, licences: status === "ACTIVE" ? ["THC"] : [], licenceRef: status === "ACTIVE" ? `SAHPRA 22C/${s.code}/2026 (demo ref)` : null,
      royaltyBps: 600, levyBps: 200, ecomBps: 1000, receiptFooter: "Thank you for choosing Herbal Holland.",
      openedAt: status === "ACTIVE" ? daysAgo(int(DAYS + 30, 700)) : null,
    });
    const members = { FLAGSHIP: 1100, STANDARD: 750, EXPRESS: 450 }[s.format];
    const walkIns = { FLAGSHIP: 20, STANDARD: 13, EXPRESS: 8 }[s.format];
    stores.push({ id, code: s.code, slug: s.slug, name: s.name, kind: "RETAIL", status, format: s.format, regionCode: s.region, city: s.city, province: s.province, sameDay: !!s.sameDay, vendor, companyKey: s.owner, dcCode: s.dc, staff: [], deviceId: uid(), seq: 0, members: extra ? Math.round(members / 4) : members, walkIns });
  }
  const retail = stores.filter((s) => s.kind === "RETAIL");
  const active = retail.filter((s) => s.status === "ACTIVE");
  const byStoreId = new Map(stores.map((s) => [s.id, s]));
  const dcOf = (s: SimStore) => stores.find((x) => x.code === s.dcCode)!;

  // ── People ──────────────────────────────────────────────────────────────
  console.log("  hashing demo credentials…");
  const PASSWORD = await hashSecret(DEMO_PASSWORD);
  const PIN = { "1111": await hashSecret("1111"), "2222": await hashSecret("2222"), "3333": await hashSecret("3333"), "4444": await hashSecret("4444") };
  const users: Prisma.UserCreateManyInput[] = [
    { id: uid(), name: "Naledi Khumalo", email: "hq@herbalholland.com", role: "HQ_ADMIN", passwordHash: PASSWORD, companyId: hq.id },
    { id: uid(), name: "Pieter de Vries", email: "merch@herbalholland.com", role: "HQ_STAFF", passwordHash: PASSWORD, companyId: hq.id },
    { id: uid(), name: "Ayesha Patel", email: "marketing@herbalholland.com", role: "HQ_STAFF", passwordHash: PASSWORD, companyId: hq.id },
    { id: uid(), name: "Johan Botha", email: "finance@herbalholland.com", role: "HQ_STAFF", passwordHash: PASSWORD, companyId: hq.id },
  ];
  const areaNames = ["Karabo Molefe", "Chantelle Hendricks", "Wian Steyn", "Zinhle Cele", "Deon Olivier"];
  REGIONS.forEach((r, i) => users.push({ id: uid(), name: areaNames[i], email: `area.${r.code.toLowerCase()}@herbalholland.com`, role: "AREA_MANAGER", passwordHash: PASSWORD, regionId: regionId[r.code] }));
  for (const o of OWNERS) users.push({ id: uid(), name: o.contact, email: o.email, role: "OWNER", passwordHash: PASSWORD, companyId: companyId[o.key] });
  // Bookkeepers: their company's books only (/books), no store or HQ pages.
  users.push(
    { id: uid(), name: "Lerato Dube", email: "accounts@herbalholland.com", role: "ACCOUNTANT", passwordHash: PASSWORD, companyId: hq.id },
    { id: uid(), name: "Priya Naidoo", email: "books@mokoenaretail.co.za", role: "ACCOUNTANT", passwordHash: PASSWORD, companyId: companyId.mokoena },
  );
  const person = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  for (const s of retail) {
    const code = s.code.toLowerCase();
    const team: [string, "MANAGER" | "BUDTENDER", keyof typeof PIN, boolean, string | null][] = [
      [person(), "MANAGER", "1111", true, `manager.${code}@herbalholland.com`],
      [person(), "BUDTENDER", "2222", true, null],
      [person(), "BUDTENDER", "3333", false, null],
      [person(), "BUDTENDER", "4444", false, null],
    ];
    for (const [name, role, pin, canDispense, email] of team) {
      const id = uid();
      users.push({ id, name, email, role, passwordHash: email ? PASSWORD : null, pinHash: PIN[pin], canDispense, storeId: s.id, companyId: companyId[s.companyKey] });
      s.staff.push({ id, name, canDispense, role });
    }
  }

  // ── Catalogue ───────────────────────────────────────────────────────────
  const catId = Object.fromEntries(CATEGORIES.map((c) => [c.slug, uid()]));
  const CAT_CODE: Record<string, string> = {
    flower: "FLW", "pre-rolls": "PRE", edibles: "EDB", vapes: "VAP", concentrates: "CON", wellness: "WEL", "coffee-drinks": "COF", "protein-nutrition": "PRO",
    "skin-care": "SKN", "collagen-supplements": "SUP", accessories: "ACC", grow: "GRW", apparel: "APP",
  };
  // The same s18A exclusions the platform applies by default (licensed medicines, and CBD supplements until counsel
  // clears them): no member prices, deals, markdowns or points on these.
  const NO_INCENTIVES = incentiveExcluded(DEFAULT_COMPLIANCE) as string[];
  // Trade case packs by category: the trade portal orders in multiples of these (Variant.caseQty). Small accessories
  // come 24 to a case, glass and vaporisers six; grow equipment and apparel are ordered by the unit.
  const CASE_QTY: Record<string, number> = { flower: 6, "pre-rolls": 6, edibles: 6, concentrates: 6, vapes: 6, "coffee-drinks": 12, wellness: 12, "skin-care": 12, "protein-nutrition": 6, "collagen-supplements": 12, accessories: 24, grow: 1, apparel: 1 };
  const caseQtyFor = (cat: string, priceCents: number) => (cat === "accessories" && priceCents >= 15_000 ? 6 : (CASE_QTY[cat] ?? 1));
  type SimVariant = { id: string; sku: string; productId: string; slug: string; name: string; label: string; grams: number | null; price: number; wholesale: number; cost: number; caseQty: number; reg: string; cat: string; heritage: boolean; featured: boolean; tobacco: boolean; line?: string; shelfMonths: number; supplier: string; thc?: [number, number]; cbd?: [number, number]; terps?: [string, number][] };
  const variants: SimVariant[] = [];
  const productRows: Prisma.ProductCreateManyInput[] = [];
  const variantRows: Prisma.VariantCreateManyInput[] = [];
  let ean = 1;
  const eanCheck = (d12: string) => {
    const sum = d12.split("").reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
    return d12 + ((10 - (sum % 10)) % 10);
  };
  const productIdBySlug: Record<string, string> = {};
  PRODUCTS.forEach((p, pi) => {
    const pid = uid();
    productIdBySlug[p.slug] = pid;
    const legalBasis = DEFAULT_LEGAL_BASIS[p.reg] ?? null;
    const capped = CBD_CLASSES.includes(p.reg as RegClass); // CBD classes: THC at most 0.001%
    const facts = PRODUCT_FACTS[p.reg] ?? [];
    productRows.push({
      id: pid, slug: p.slug, name: p.name, tagline: p.tagline, line: p.line, categoryId: catId[p.cat], description: p.desc, strain: p.strain,
      thcMin: p.thc?.[0] ?? (capped ? 0 : null), thcMax: p.thc?.[1] ?? (capped ? THC_CAP_PCT : null), cbdMin: p.cbd?.[0], cbdMax: p.cbd?.[1],
      terpenes: p.terps ? p.terps.map(([name, pct]) => ({ name, pct })) : undefined, effects: p.effects ?? [], flavours: p.flavours ?? [],
      lineage: p.lineage, origin: p.origin, heritage: !!p.heritage, regClass: p.reg, legalBasis, cbdMgPerPack: p.cbdPack, cbdMgPerDay: p.reg === "CBD" ? p.cbdDay : null,
      claims: p.claims ?? [], tobaccoRelated: !!p.tobacco, featured: !!p.featured, status: "ACTIVE", createdAt: daysAgo(int(120, 400)),
      netContent: facts.includes("netContent") ? p.net?.[0] : null, netUnit: facts.includes("netContent") ? p.net?.[1] : null,
      ingredients: facts.includes("ingredients") ? p.ingredients : null, allergens: facts.includes("allergens") ? (p.allergens ?? []) : [], naturalCbd: p.reg === "CBD_FOOD" && !!p.naturalCbd,
    });
    const code = p.slug.split("-").slice(0, 2).map((w) => w.slice(0, 2).toUpperCase()).join("");
    p.variants.forEach(([label, grams, rand$], vi) => {
      const id = uid();
      const price = rand$ * 100;
      const wholesale = Math.round((price / 1.15) * (p.reg === "THC" ? 0.52 : p.reg === "APPAREL" ? 0.5 : 0.55));
      const cost = Math.round(wholesale * (p.reg === "THC" ? 0.55 : 0.62));
      const sku = `${CAT_CODE[p.cat]}-${code}${pi}-${label.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)}`;
      variantRows.push({ id, productId: pid, sku, barcode: eanCheck(`6001234${String(ean++).padStart(5, "0")}`), name: label, grams, priceCents: price, wholesaleCents: wholesale, caseQty: caseQtyFor(p.cat, price), costCents: cost, sortOrder: vi });
      variants.push({ id, sku, productId: pid, slug: p.slug, name: p.name, label, grams, price, wholesale, cost, caseQty: caseQtyFor(p.cat, price), reg: p.reg, cat: p.cat, heritage: !!p.heritage, featured: !!p.featured, tobacco: !!p.tobacco, line: p.line, shelfMonths: p.shelfMonths, supplier: p.supplier, thc: p.thc, cbd: p.cbd, terps: p.terps });
    });
  });
  const vById = new Map(variants.map((v) => [v.id, v]));

  // ── Batches ─────────────────────────────────────────────────────────────
  type SimBatch = { id: string; code: string; variantId: string; packedAt: Date; expiresAt: Date | null; unsellableFrom?: Date; status: "RELEASED" | "QUARANTINE" | "RECALLED"; reason?: string };
  const batches: SimBatch[] = [];
  const batchRows: Prisma.BatchCreateManyInput[] = [];
  const tested = new Set(["THC", "CBD", "CBD_FOOD", "CBD_TOPICAL", "HEMP"]); // every class with hemp in it gets a COA
  for (const v of variants) {
    const cannabis = tested.has(v.reg);
    const packs = cannabis ? [DAYS + 110, DAYS + 25, Math.round(DAYS / 3)] : [DAYS + 90, Math.round(DAYS / 2)];
    packs.forEach((ago, i) => {
      const letter = "ABC"[i];
      const packedAt = daysAgo(ago + rand(0, 3));
      let expiresAt = v.shelfMonths ? new Date(packedAt.getTime() + v.shelfMonths * 30.4 * DAY) : null;
      // Edibles' oldest batch is close to expiry, to drive the markdown/expiry reports.
      if (v.cat === "edibles" && i === 0) expiresAt = daysAgo(-int(8, 16));
      if (v.cat === "wellness" && i === 0 && v.reg === "CBD") expiresAt = daysAgo(-int(12, 20));
      const code = `${v.sku.split("-").slice(1).join("-")}-${dayKey(packedAt).slice(2, 7).replace("-", "")}${letter}`;
      const b: SimBatch = { id: uid(), code, variantId: v.id, packedAt, expiresAt, status: "RELEASED" };
      if (v.slug === "rooibos-honey-gummies" && i === 1) Object.assign(b, { status: "RECALLED", unsellableFrom: daysAgo(10), reason: "Voluntary recall: potency label misprint (actual 7.5 mg per piece)" });
      if (v.slug === "tulip-og" && v.label === "3.5g" && i === 2) Object.assign(b, { status: "QUARANTINE", unsellableFrom: daysAgo(3), reason: "Awaiting microbial re-test" });
      batches.push(b);
      const thc = v.thc ? +rand(v.thc[0], v.thc[1]).toFixed(1) : CBD_CLASSES.includes(v.reg as RegClass) ? 0 : null;
      batchRows.push({
        id: b.id, code: b.code, variantId: v.id, supplier: v.supplier, packedAt, expiresAt, status: b.status, statusReason: b.reason,
        thc, cbd: v.cbd ? +rand(v.cbd[0], v.cbd[1]).toFixed(2) : v.reg === "THC" ? +rand(0.05, 0.6).toFixed(2) : null,
        labName: cannabis ? pick(["Highveld Analytical Laboratories", "Cape Cannabis Testing", "KZN Phyto Labs"]) + " (demo)" : null,
        coaRef: cannabis ? `COA-${b.code}` : null,
        labResults: cannabis
          ? { microbials: "PASS", pesticides: "PASS", heavyMetals: "PASS", mycotoxins: "PASS", residualSolvents: v.cat === "concentrates" || v.cat === "vapes" ? "PASS" : "N/A", moisturePct: v.cat === "flower" ? +rand(9.5, 12).toFixed(1) : null, terpenes: (v.terps ?? []).map(([name, pct]) => ({ name, pct: +(pct * rand(0.85, 1.15)).toFixed(2) })) }
          : undefined,
      });
    });
  }
  const batchesOf = new Map<string, SimBatch[]>();
  for (const b of batches) batchesOf.set(b.variantId, [...(batchesOf.get(b.variantId) ?? []), b]);
  const bById = new Map(batches.map((b) => [b.id, b]));
  const sellable = (b: SimBatch, ts: Date) => !(b.unsellableFrom && ts >= b.unsellableFrom) && !(b.expiresAt && b.expiresAt <= ts);

  // ── Ranging & local prices ──────────────────────────────────────────────
  const EXPRESS_SKIP = new Set(["grow-tent", "led-grow-light", "kite-vaporiser", "delft-water-pipe", "sunset-hoodie", "reserve-gelato-cake"]);
  const PAR: Record<string, number> = {
    flower: 14, "pre-rolls": 16, edibles: 10, vapes: 8, concentrates: 5, wellness: 8, "coffee-drinks": 8, "protein-nutrition": 4, "skin-care": 6, "collagen-supplements": 4,
    accessories: 8, grow: 3, apparel: 4,
  };
  const ranged = new Map<string, { par: number; rp: number; price?: number }>();
  const svRows: Prisma.StoreVariantCreateManyInput[] = [];
  const overrides: { storeId: string; variantId: string; price: number }[] = [];
  for (const s of retail)
    for (const v of variants) {
      if (s.format === "EXPRESS" && EXPRESS_SKIP.has(v.slug)) continue;
      const mult = s.format === "FLAGSHIP" ? 1.6 : s.format === "EXPRESS" ? 0.6 : 1;
      const par = Math.max(2, Math.round(PAR[v.cat] * mult * (v.label === "1g" ? 1.3 : v.label === "7g" ? 0.4 : 1)));
      let price: number | undefined;
      if (s.code === "CPT01" && v.line === "HOUSE" && v.cat === "flower") price = v.price + 2000; // tourist premium
      if (s.code === "JHB06" && v.heritage && v.cat === "flower") price = v.price - 1000; // Soweto community pricing
      if (s.code === "PTA01" && v.slug === "sunset-grinder") price = 32900;
      if (price) overrides.push({ storeId: s.id, variantId: v.id, price });
      ranged.set(`${s.id}|${v.id}`, { par, rp: Math.ceil(par * 0.35), price });
      svRows.push({ storeId: s.id, variantId: v.id, parLevel: par, reorderPoint: Math.ceil(par * 0.35), priceCents: price });
    }

  // ── Stock simulation state ──────────────────────────────────────────────
  type Lot = { batchId: string; onHand: number; unitCost: number };
  const lots = new Map<string, Lot[]>();
  const movements: Prisma.StockMovementCreateManyInput[] = [];
  const lk = (s: string, v: string) => `${s}|${v}`;
  function put(storeId: string, variantId: string, batchId: string, qty: number, unitCost: number, type: Prisma.StockMovementCreateManyInput["type"], ts: Date, extra: Partial<Prisma.StockMovementCreateManyInput> = {}) {
    const arr = lots.get(lk(storeId, variantId)) ?? [];
    let lot = arr.find((l) => l.batchId === batchId);
    if (!lot) arr.push((lot = { batchId, onHand: 0, unitCost }));
    const base = Math.max(lot.onHand, 0);
    const before = lot.onHand * lot.unitCost;
    lot.unitCost = base + qty > 0 ? Math.round((base * lot.unitCost + qty * unitCost) / (base + qty)) : unitCost;
    lot.onHand += qty;
    lots.set(lk(storeId, variantId), arr);
    const revalueCents = lot.onHand * lot.unitCost - before - qty * unitCost; // as putStock records it
    movements.push({ id: uid(), storeId, variantId, batchId, qty, type, unitCostCents: unitCost, revalueCents, createdAt: ts, ...extra });
  }
  const sellableLots = (storeId: string, variantId: string, ts: Date) =>
    (lots.get(lk(storeId, variantId)) ?? []).filter((l) => l.onHand > 0 && sellable(bById.get(l.batchId)!, ts) && bById.get(l.batchId)!.packedAt <= ts);
  const available = (storeId: string, variantId: string, ts: Date) => sellableLots(storeId, variantId, ts).reduce((s, l) => s + l.onHand, 0);
  function take(storeId: string, variantId: string, qty: number, type: Prisma.StockMovementCreateManyInput["type"], ts: Date, extra: Partial<Prisma.StockMovementCreateManyInput> = {}) {
    const cand = sellableLots(storeId, variantId, ts).map((l) => {
      const b = bById.get(l.batchId)!;
      return { batchId: l.batchId, onHand: l.onHand, unitCostCents: l.unitCost, sellable: true, expiresAt: b.expiresAt, packedAt: b.packedAt };
    });
    const { allocations } = allocate(cand, qty);
    for (const a of allocations) {
      lots.get(lk(storeId, variantId))!.find((l) => l.batchId === a.batchId)!.onHand -= a.qty;
      movements.push({ id: uid(), storeId, variantId, batchId: a.batchId, qty: -a.qty, type, unitCostCents: a.unitCostCents, createdAt: ts, ...extra });
    }
    return allocations;
  }

  // DC opening stock (from growers & suppliers): every batch lands at every DC.
  const dcs = stores.filter((s) => s.kind === "WAREHOUSE");
  for (const dc of dcs)
    for (const b of batches) {
      const v = vById.get(b.variantId)!;
      const qty = Math.round((PAR[v.cat] ?? 6) * active.length * (v.cat === "flower" || v.cat === "pre-rolls" ? 9 : 6) * (dc.code === "DC-GP" ? 1.3 : 0.7));
      put(dc.id, v.id, b.id, qty, v.cost, "RECEIVE", b.packedAt, { note: `Received from ${v.supplier}` });
    }

  // Store opening stock, from the batches that existed before the window.
  const t0 = at(dayKeys[0], 7 * 60);
  for (const s of active)
    for (const v of variants) {
      const r = ranged.get(lk(s.id, v.id));
      if (!r) continue;
      const bs = (batchesOf.get(v.id) ?? []).filter((b) => b.packedAt < t0 && sellable(b, t0));
      const b = bs[bs.length - 1] ?? bs[0];
      if (!b) continue;
      put(s.id, v.id, b.id, Math.round(r.par * rand(1.1, 1.6)), v.wholesale, "RECEIVE", new Date(t0.getTime() - DAY), { note: "Opening balance" });
    }

  // ── Customers ───────────────────────────────────────────────────────────
  type SimCustomer = {
    id: string; memberNo: string; phone: string; email: string | null; firstName: string; lastName: string; dob: Date; homeStoreId: string;
    createdAt: Date; p: number; points: number; lifetime: number; visits: number; first: Date | null; last: Date | null; prior12m: number;
    spend: { ts: number; cents: number }[]; tier: TierKey; ageCheck: "ID_NUMBER" | "VERIFIED"; referredById: string | null; referralCode: string;
    consents: { WHATSAPP: boolean; SMS: boolean; EMAIL: boolean; PUSH: boolean }; source: string;
    auth: { id: string; from: Date; to: Date; limit: number; grams: { ts: number; g: number }[] } | null;
    atRisk?: boolean;
  };
  const customers: SimCustomer[] = [];
  const usedPhones = new Set<string>();
  let memberSeq = 0;
  const loyalty: Prisma.LoyaltyEntryCreateManyInput[] = [];
  const authRows: Prisma.PatientAuthCreateManyInput[] = [];
  const DOCTORS = [["Dr N. Mthembu", "MP0654321"], ["Dr A. van Wyk", "MP0712345"], ["Dr R. Chetty", "MP0598765"], ["Dr L. Petersen", "MP0687123"], ["Dr S. Radebe", "MP0734567"]];
  for (const s of active) {
    for (let i = 0; i < s.members; i++) {
      const freq = weighted([["weekly", 0.09], ["fortnightly", 0.17], ["monthly", 0.3], ["occasional", 0.3], ["prospect", 0.14]] as const);
      const p = { weekly: 1 / 6, fortnightly: 1 / 13, monthly: 1 / 28, occasional: 1 / 70, prospect: 0 }[freq];
      const joinedInWindow = chance(0.18);
      const createdAt = joinedInWindow ? at(pick(dayKeys.slice(0, -1)), int(9 * 60, 19 * 60)) : daysAgo(int(DAYS + 5, 700));
      const prior = joinedInWindow || freq === "prospect" ? 0 : { weekly: rand(8000, 22000), fortnightly: rand(3000, 9000), monthly: rand(1200, 4200), occasional: rand(200, 1500) }[freq] * 100;
      let phone: string;
      do phone = `+27${pick(["6", "7", "8"])}${int(10000000, 99999999)}`; while (usedPhones.has(phone));
      usedPhones.add(phone);
      const firstName = pick(FIRST_NAMES), lastName = pick(LAST_NAMES);
      const hasEmail = chance(0.72);
      const lapsed = freq === "occasional" && chance(0.35);
      const c: SimCustomer = {
        id: uid(), memberNo: `HH${String(100000 + ++memberSeq).padStart(7, "0")}`, phone,
        email: hasEmail ? `${firstName}.${lastName}.${memberSeq}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + "@example.co.za" : null,
        firstName, lastName, dob: new Date(Date.UTC(int(1958, 2004), int(0, 11), int(1, 28))), homeStoreId: s.id, createdAt,
        p: lapsed ? 0 : p, points: 0, lifetime: Math.round(prior * rand(1, 1.6)), visits: prior ? Math.max(1, Math.round(prior / 48000)) : 0,
        first: prior ? new Date(createdAt.getTime() + int(0, 20) * DAY) : null,
        last: prior ? daysAgo(DAYS + (lapsed ? int(70, 260) : int(1, 40))) : null, prior12m: Math.round(prior), spend: [], tier: tierFor(prior).key,
        ageCheck: chance(0.35) ? "VERIFIED" : "ID_NUMBER", referredById: null, referralCode: `${firstName.slice(0, 4).toUpperCase()}${(46656 + memberSeq).toString(36).toUpperCase()}`,
        consents: { SMS: chance(0.7), EMAIL: hasEmail && chance(0.62), WHATSAPP: chance(0.32), PUSH: chance(0.3) },
        source: joinedInWindow ? weighted([["POS", 0.55], ["WEB", 0.3], ["REFERRAL", 0.15]] as const) : weighted([["POS", 0.7], ["WEB", 0.3]] as const), auth: null,
      };
      if (c.first && c.last && c.first > c.last) c.first = new Date(c.last.getTime() - 30 * DAY);
      if (c.source === "REFERRAL" && customers.length) c.referredById = pick(customers).id;
      if (freq !== "prospect" && chance(0.62)) {
        const from = new Date(Math.min(createdAt.getTime(), daysAgo(DAYS).getTime()) - int(0, 120) * DAY);
        const to = chance(0.08) ? daysAgo(-int(2, 12)) : new Date(from.getTime() + pick([180, 365]) * DAY);
        c.auth = { id: uid(), from, to: to < daysAgo(DAYS) ? daysAgo(-int(30, 200)) : to, limit: pick([30, 45, 60, 90]), grams: [] };
        const [doc, reg] = pick(DOCTORS);
        authRows.push({ id: c.auth.id, customerId: c.id, authNumber: `S21/${dayKey(from).slice(0, 4)}/${int(10000, 99999)}`, prescriber: doc, prescriberRegNo: reg, scope: "Dried flower, pre-rolls, oral and inhaled preparations", monthlyLimitGrams: c.auth.limit, validFrom: from, validTo: c.auth.to, documentRef: `auth-docs/${c.id}.pdf` });
      }
      const opening = prior ? Math.round(pointsFor(prior, c.tier) * rand(0.2, 0.7)) : 0;
      loyalty.push({ id: uid(), customerId: c.id, points: 25, kind: "SIGNUP", createdAt, note: "Welcome to Herbal Holland Rewards" });
      c.points += 25;
      if (opening) {
        loyalty.push({ id: uid(), customerId: c.id, points: opening, kind: "ADJUST", createdAt: daysAgo(DAYS + 1), note: "Balance brought forward" });
        c.points += opening;
      }
      customers.push(c);
    }
  }
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const byHome = new Map<string, SimCustomer[]>();
  for (const c of customers) byHome.set(c.homeStoreId, [...(byHome.get(c.homeStoreId) ?? []), c]);

  // ── Promotions & price lists (drive simulated baskets through the real engine) ──
  const sep1 = midnight(`${NOW.getUTCFullYear()}-09-01`);
  const cat = (slug: string) => catId[slug];
  const pids = (...slugs: string[]) => slugs.map((s) => productIdBySlug[s]);
  const promoDefs: (Prisma.PromotionCreateManyInput & { id: string })[] = [
    { id: uid(), name: "Heritage Month: 15% off apparel & accessories", description: "Celebrating Heritage Month with 15% off the windmill range all September.", kind: "PERCENT", value: 15, categoryIds: [cat("apparel"), cat("accessories")], productIds: [], channels: ["POS", "ONLINE"], startsAt: sep1, endsAt: midnight(`${NOW.getUTCFullYear()}-10-01`) },
    // CBD skin care may be promoted; CBD supplements (oils, softgels) may not until counsel clears them (s18A).
    { id: uid(), name: "Any 2 CBD creams or balms for R650", description: "Mix and match the CBD body cream and the Recover muscle balm.", kind: "MULTIBUY", value: 65000, buyQty: 2, categoryIds: [], productIds: pids("cbd-body-cream", "recover-cbd-balm"), channels: ["POS", "ONLINE"], startsAt: daysAgo(DAYS), endsAt: daysAgo(-45) },
    { id: uid(), name: "Rolling essentials: tray + free papers", description: "Buy a rolling tray and get a booklet of Classic Papers free.", kind: "BUY_X_GET_Y", value: 0, buyQty: 1, getQty: 1, rewardPercent: 100, productIds: pids("windmill-rolling-tray"), categoryIds: [], rewardProductIds: pids("king-size-papers"), channels: ["POS", "ONLINE"], startsAt: daysAgo(DAYS), endsAt: daysAgo(-60) },
    { id: uid(), name: "Spend R600, get the Sunset grinder free", description: "Gift with purchase on non-medicinal items.", kind: "BUY_X_GET_Y", value: 0, minSpendCents: 60000, getQty: 1, rewardPercent: 100, productIds: [], categoryIds: [], rewardProductIds: pids("sunset-grinder"), channels: ["POS"], startsAt: daysAgo(21), endsAt: daysAgo(-21) },
    { id: uid(), name: "Happy hour: 10% off accessories", description: "Weekdays 16:00–18:00.", kind: "PERCENT", value: 10, categoryIds: [cat("accessories")], productIds: [], channels: ["POS"], days: [1, 2, 3, 4, 5], startMinute: 16 * 60, endMinute: 18 * 60, startsAt: daysAgo(DAYS), endsAt: daysAgo(-90) },
    { id: uid(), name: "Double Points Fridays", description: "2× points every Friday.", kind: "MULTIPLIER", value: 200, categoryIds: [], productIds: [], channels: ["POS", "ONLINE"], days: [5], startsAt: daysAgo(DAYS), endsAt: daysAgo(-90) },
    { id: uid(), name: "Welcome back: R75 off R400", description: "Win-back offer for members we haven't seen in a while.", code: "WELCOMEBACK", kind: "FIXED", value: 7500, minSpendCents: 40000, categoryIds: [], productIds: [], channels: ["POS", "ONLINE"], startsAt: daysAgo(20), endsAt: daysAgo(-10) },
    { id: uid(), name: "10% off your first online order", code: "WELCOME10", kind: "PERCENT", value: 10, categoryIds: [], productIds: [], channels: ["ONLINE"], startsAt: daysAgo(DAYS), endsAt: daysAgo(-120) },
    { id: uid(), name: "Sea Point: 10% off apparel", description: "Local offer for Atlantic Seaboard visitors.", code: "SEAPOINT10", kind: "PERCENT", value: 10, categoryIds: [cat("apparel")], productIds: [], channels: ["POS"], storeIds: [stores.find((s) => s.code === "CPT01")!.id], ownerStoreId: stores.find((s) => s.code === "CPT01")!.id, startsAt: daysAgo(30), endsAt: daysAgo(-30) },
    { id: uid(), name: "Welcome gift: a free hemp wick", description: "New members: add a hemp wick to your first basket and it's on us.", kind: "BUY_X_GET_Y", value: 0, getQty: 1, rewardPercent: 100, rewardProductIds: pids("hemp-wick"), productIds: [], categoryIds: [], channels: ["POS", "ONLINE"], firstPurchaseOnly: true, startsAt: daysAgo(DAYS), endsAt: daysAgo(-60) },
  ];
  const promoInputs = promoDefs.map((p) => ({
    ...p, code: p.code ?? null, minSpendCents: p.minSpendCents ?? 0, buyQty: p.buyQty ?? null, getQty: p.getQty ?? null, rewardPercent: p.rewardPercent ?? null,
    rewardProductIds: (p.rewardProductIds as string[]) ?? [], rewardCategoryIds: [], categoryIds: p.categoryIds as string[], productIds: p.productIds as string[],
    storeIds: (p.storeIds as string[]) ?? [], channels: p.channels as string[], days: (p.days as number[]) ?? [],
  }));
  const promosAt = (ts: Date, channel: "POS" | "ONLINE", storeId: string) =>
    promoInputs.filter((p) => !p.firstPurchaseOnly && p.channels.includes(channel) && ts >= (p.startsAt as Date) && ts <= (p.endsAt as Date) && (!p.storeIds.length || p.storeIds.includes(storeId)) && promoWindowOpen(p, ts)) as unknown as PromoInput[];
  const heritagePromoId = promoDefs[0].id;
  const winbackPromoId = promoDefs[6].id;

  // ── Trade (wholesale) channel: the price list, the accounts and their buyers ─────────────────────────────────────
  // Businesses buy at ex-VAT trade prices (src/lib/trade.ts; HQ → Trade). "Trade 2026" prices most of the range at 12%
  // over what stores pay, with quantity breaks on up to twenty of those lines (three cases −4%, six cases −8%); everything
  // else falls back to the wholesale price. Licensed medicines are never on a trade list and never in a trade basket.
  const { DEFAULT_SETTINGS } = await import("../src/server/settings");
  const TRADE = DEFAULT_SETTINGS.trade;
  const plTrade = uid();
  type Break = { minQty: number; price: number };
  const tradeBreaksOf = new Map<string, Break[]>();
  const round5 = (c: number) => Math.round(c / 5) * 5;
  let breakLines = 0;
  let priced = 0;
  for (const v of variants) {
    if (v.reg === "THC" || !chance(0.7)) continue;
    const base = round5(v.wholesale * 1.12);
    const breaks: Break[] = [{ minQty: 1, price: base }];
    if (breakLines < 20 && ++priced % 4 !== 0) {
      breakLines++;
      breaks.push({ minQty: 3 * v.caseQty, price: round5(base * 0.96) }, { minQty: 6 * v.caseQty, price: round5(base * 0.92) });
    }
    tradeBreaksOf.set(v.id, breaks);
  }
  // The trade price for a quantity, as resolveTradePrice finds it: the deepest break reached on the list, else the wholesale price.
  const tradeUnit = (v: SimVariant, qty: number) => (tradeBreaksOf.get(v.id) ?? []).filter((b) => b.minQty <= qty).sort((a, b) => b.minQty - a.minQty)[0]?.price ?? v.wholesale;

  type Prov3 = "GP" | "WC" | "KZN";
  type TradeKind = "PHARMACY" | "RETAILER" | "CAFE" | "PRACTICE" | "ONLINE_SHOP" | "OTHER";
  type Addr = [line: string, suburb: string | null, city: string, province: Prov3, postalCode: string];
  type SimBuyer = { id: string; name: string; email: string; phone: string | null; role: "OWNER" | "BUYER" };
  type SimAccount = {
    id: string; number: string; name: string; legalName: string; kind: TradeKind; regNumber: string | null; vatNumber: string | null; email: string; phone: string;
    addressLine: string; suburb: string | null; city: string; province: Prov3; postalCode: string; delivery: Addr | null;
    status: "PENDING" | "APPROVED" | "ON_HOLD" | "CLOSED"; terms: "PREPAID" | "ACCOUNT"; creditLimitCents: number; paymentDays: number; classes: RegClass[];
    dc: SimStore; priceListId: string | null; notes: string | null; applied: Date; approvedAt: Date | null; holdReason: string | null; heldAt: Date | null; closedAt: Date | null;
    buyers: SimBuyer[]; ref: string; rate: number; balance: number; open: number; reserve: number; // credit kept free for the demo's own open orders
  };
  type AccDef = {
    name: string; legalName: string; kind: TradeKind; reg?: string; vat?: string; email: string; phone: string; ref: string; address: Addr; delivery?: Addr;
    status: SimAccount["status"]; terms?: "PREPAID" | "ACCOUNT"; limit?: number; applied: number; approvedDays?: number; classes?: RegClass[];
    buyers: [name: string, email: string, phone: string | null, role: "OWNER" | "BUYER"][]; notes?: string; holdReason?: string; heldAgo?: number; closedAgo?: number; rate?: number; ownList?: boolean; reserve?: number;
  };
  const HEALTH_CLASSES: RegClass[] = ["CBD", "CBD_TOPICAL", "SUPPLEMENT", "HEMP"]; // pharmacies and practices
  const CAFE_CLASSES: RegClass[] = ["CBD_FOOD", "HEMP", "ACCESSORY"];
  // Fourteen businesses, numbered in the order they applied. The demo trade buyer is Greenleaf Pharmacy's owner buyer
  // (trade@greenleafpharmacy.co.za: /trade/login, the code is shown on screen in demo mode).
  const ACCOUNTS: AccDef[] = [
    { name: "Greenleaf Pharmacy", legalName: "Greenleaf Pharmacy (Pty) Ltd", kind: "PHARMACY", reg: "2016/204388/07", vat: "4620118473", email: "accounts@greenleafpharmacy.co.za", phone: "+27123620480", ref: "GREENLEAF", address: ["Shop 12, Hatfield Square, Burnett Street", "Hatfield", "Pretoria", "GP", "0083"], status: "APPROVED", terms: "ACCOUNT", limit: 5_000_000, applied: 150, approvedDays: 2, reserve: 2_000_000, buyers: [["Naledi Khumalo", "trade@greenleafpharmacy.co.za", "+27825550140", "OWNER"], ["Thandeka Zulu", "dispensary@greenleafpharmacy.co.za", null, "BUYER"]], notes: "Deliveries to the back entrance on Grosvenor Street, weekdays before 15:00." },
    { name: "The Kind Café", legalName: "The Kind Café (Pty) Ltd", kind: "CAFE", reg: "2021/118246/07", vat: "4710204871", email: "hello@thekindcafe.co.za", phone: "+27214470912", ref: "KIND CAFE", address: ["44 Lower Main Road", "Observatory", "Cape Town", "WC", "7925"], status: "APPROVED", terms: "PREPAID", applied: 142, approvedDays: 3, buyers: [["Jess Carstens", "jess@thekindcafe.co.za", "+27829914471", "OWNER"]] },
    { name: "Midlands Wellness Practice", legalName: "Midlands Wellness Practice Inc.", kind: "PRACTICE", reg: "2019/311907/21", email: "practice@midlandswellness.co.za", phone: "+27333301188", ref: "MIDLANDS WP", address: ["7 Main Road", null, "Howick", "KZN", "3290"], status: "APPROVED", terms: "ACCOUNT", limit: 2_500_000, applied: 135, approvedDays: 4, buyers: [["Anele Mkhize", "anele@midlandswellness.co.za", "+27837720315", "OWNER"]] },
    { name: "Bo-Kaap Apothecary", legalName: "Bo-Kaap Apothecary (Pty) Ltd", kind: "RETAILER", reg: "2017/458201/07", vat: "4650098122", email: "orders@bokaapapothecary.co.za", phone: "+27214240077", ref: "BOKAAP APOTH", address: ["88 Wale Street", "Bo-Kaap", "Cape Town", "WC", "8001"], status: "APPROVED", terms: "ACCOUNT", limit: 3_000_000, applied: 128, approvedDays: 2, reserve: 800_000, buyers: [["Yusuf Dollie", "yusuf@bokaapapothecary.co.za", "+27823301190", "OWNER"], ["Amina Dollie", "amina@bokaapapothecary.co.za", null, "BUYER"]] },
    { name: "Umhlanga Health Pharmacy", legalName: "Umhlanga Health Pharmacy (Pty) Ltd", kind: "PHARMACY", reg: "2014/087310/07", vat: "4580012398", email: "accounts@umhlangahealth.co.za", phone: "+27315611204", ref: "UMHLANGA HP", address: ["Shop 5, Chartwell Centre, Chartwell Drive", "Umhlanga Rocks", "Durban", "KZN", "4320"], status: "APPROVED", terms: "PREPAID", applied: 121, approvedDays: 3, buyers: [["Kiara Naidoo", "kiara@umhlangahealth.co.za", "+27834412210", "OWNER"]] },
    { name: "Linden Corner Store", legalName: "Lukas Botha", kind: "RETAILER", email: "lindencorner@example.co.za", phone: "+27118880421", ref: "LINDEN CORNER", address: ["Shop 2, 4th Avenue", "Linden", "Johannesburg", "GP", "2195"], status: "APPROVED", terms: "ACCOUNT", limit: 1_000_000, applied: 114, approvedDays: 5, buyers: [["Lukas Botha", "lukas.botha@example.co.za", "+27829012244", "OWNER"]], notes: "Sole proprietor, not VAT registered." },
    { name: "Roots & Rooibos Café", legalName: "Roots and Rooibos (Pty) Ltd", kind: "CAFE", reg: "2020/233514/07", vat: "4690071355", email: "cafe@rootsandrooibos.co.za", phone: "+27123461190", ref: "ROOTS ROOIBOS", address: ["12 Lynnwood Road", "Brooklyn", "Pretoria", "GP", "0181"], status: "APPROVED", terms: "PREPAID", applied: 107, approvedDays: 2, buyers: [["Mpho Sithole", "mpho@rootsandrooibos.co.za", "+27836601182", "OWNER"]] },
    { name: "Hemp & Home Online", legalName: "Hemp and Home Online (Pty) Ltd", kind: "ONLINE_SHOP", reg: "2022/301877/07", vat: "4730116209", email: "finance@hempandhome.co.za", phone: "+27104470550", ref: "HEMP HOME", address: ["3 Kramer Road", "Kramerville", "Sandton", "GP", "2090"], delivery: ["Unit 7, Linbro Business Park, Galaxy Avenue", "Linbro Park", "Sandton", "GP", "2065"], status: "APPROVED", terms: "ACCOUNT", limit: 4_000_000, applied: 100, approvedDays: 2, ownList: true, reserve: 2_000_000, buyers: [["Dineo Maseko", "dineo@hempandhome.co.za", "+27827740930", "OWNER"], ["Tebogo Rakgole", "warehouse@hempandhome.co.za", "+27836112078", "BUYER"]], notes: "Online retailer that ships from the Linbro Park warehouse. Deliver there, not to the office." },
    { name: "Stellenbosch Physio & Wellness", legalName: "Stellenbosch Physio and Wellness Inc.", kind: "PRACTICE", reg: "2018/142290/21", email: "admin@stellenboschphysio.co.za", phone: "+27218870341", ref: "STB PHYSIO", address: ["23 Andringa Street", null, "Stellenbosch", "WC", "7600"], status: "APPROVED", terms: "PREPAID", applied: 93, approvedDays: 3, buyers: [["Marli Louw", "marli@stellenboschphysio.co.za", "+27824409912", "OWNER"]] },
    { name: "Durban North Pharmacy", legalName: "Durban North Pharmacy (Pty) Ltd", kind: "PHARMACY", reg: "2012/055641/07", vat: "4560087731", email: "accounts@durbannorthpharmacy.co.za", phone: "+27315631107", ref: "DBN NORTH PH", address: ["56 Kensington Drive", "Durban North", "Durban", "KZN", "4051"], status: "ON_HOLD", terms: "ACCOUNT", limit: 2_000_000, applied: 86, approvedDays: 2, holdReason: "overdue", heldAgo: 37, rate: 0, buyers: [["Pravesh Maharaj", "pravesh@durbannorthpharmacy.co.za", "+27833318840", "OWNER"], ["Nisha Maharaj", "nisha@durbannorthpharmacy.co.za", null, "BUYER"]] },
    { name: "Vilakazi Street Health Shop", legalName: "VS Health Shop (Pty) Ltd", kind: "RETAILER", reg: "2023/409118/07", email: "lerato@vshealthshop.co.za", phone: "+27119361020", ref: "VS HEALTH", address: ["8107 Vilakazi Street", "Orlando West", "Soweto", "GP", "1804"], status: "ON_HOLD", terms: "ACCOUNT", limit: 1_500_000, applied: 75, approvedDays: 4, holdReason: "Awaiting updated CIPC documents after the change of directors", heldAgo: 12, buyers: [["Lerato Mabaso", "orders@vshealthshop.co.za", "+27825501937", "OWNER"]] },
    { name: "Pretoria East Pharmacy", legalName: "Pretoria East Pharmacy (Pty) Ltd", kind: "PHARMACY", reg: "2011/197022/07", vat: "4540021198", email: "accounts@pretoriaeastpharmacy.co.za", phone: "+27123481166", ref: "PTA EAST PH", address: ["Shop 2, Glenfair Boulevard, Lynnwood Road", "Lynnwood", "Pretoria", "GP", "0081"], status: "CLOSED", terms: "ACCOUNT", limit: 2_000_000, applied: 68, approvedDays: 3, holdReason: "Business sold: the new owner will apply for their own account", closedAgo: 20, rate: 0, buyers: [["Carla Fourie", "carla@pretoriaeastpharmacy.co.za", "+27829947210", "OWNER"]] },
    { name: "Ballito Beach Café", legalName: "Ballito Beach Café (Pty) Ltd", kind: "CAFE", reg: "2024/152087/07", vat: "4760130455", email: "sam@ballitobeachcafe.co.za", phone: "+27324461201", ref: "BALLITO CAFE", address: ["2 Compensation Beach Road", null, "Ballito", "KZN", "4420"], status: "PENDING", applied: 3, buyers: [["Sam Pretorius", "sam.pretorius@ballitobeachcafe.co.za", "+27836920033", "OWNER"]], notes: "We'd like the hemp coffee and the rooibos tea for the café, plus a few accessories for the shelf by the till." },
    { name: "Garden Route Health Shop", legalName: "Garden Route Health Shop (Pty) Ltd", kind: "RETAILER", reg: "2015/388190/07", email: "elize@gardenroutehealth.co.za", phone: "+27448740388", ref: "GARDEN ROUTE", address: ["112 York Street", null, "George", "WC", "6529"], status: "PENDING", applied: 1, buyers: [["Elize Barnard", "elize@gardenroutehealth.co.za", "+27824103399", "OWNER"]] },
  ];
  const hqNaledi = users[0], hqPieter = users[1], hqJohan = users[3];
  const hqActor = (u: Prisma.UserCreateManyInput) => ({ actorType: "USER", actorId: u.id as string, actorName: u.name });
  const buyerActor = (b: SimBuyer) => ({ actorType: "CUSTOMER", actorId: b.id, actorName: `${b.name} (trade buyer)` });
  const tradeAccounts: SimAccount[] = [];
  const tradeAccountRows: Prisma.TradeAccountCreateManyInput[] = [];
  const tradeAudit: Prisma.AuditLogCreateManyInput[] = [];
  // Licences: what each kind of business needs for its ranges (src/lib/trade-licences.ts), sent with the application
  // and checked by HQ just before approval; the two applications wait with theirs. Midlands' practice number runs out
  // next week with the renewal waiting for HQ, Stellenbosch's in a fortnight with nothing sent yet (both reminded), and
  // Vilakazi Street has sent the new CIPC certificate its hold waits for. Linden Corner, a sole proprietor, holds its
  // SARS registration instead of a CIPC certificate. Numbers come from the account, not the RNG.
  const tradeLicenceRows: Prisma.TradeLicenceCreateManyInput[] = [];
  const licenceDocs: { uploadId: string; account: SimAccount; kind: TradeLicenceKind; number: string; expiresAt: Date | null; at: Date }[] = [];
  const PRACTICE_EXPIRY: Record<string, number> = { "Midlands Wellness Practice": 9, "Stellenbosch Physio & Wellness": 16 }; // days from today
  const digits = (seed: string, n: number) => String(parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 12), 16) % 10 ** n).padStart(n, "0");
  const licenceNumber = (a: SimAccount, kind: TradeLicenceKind) => {
    const d = (n: number) => digits(`${a.number}:${kind}`, n);
    return { CIPC_REGISTRATION: a.regNumber!, SARS_REGISTRATION: `0${d(9)}`, PRACTICE_NUMBER: d(7), PHARMACY_LICENCE: `DOH/PH/${d(5)}`, SAPC_RECORDING: `P${d(6)}`, BUSINESS_LICENCE: `BL/${a.province}/${d(5)}`, FOOD_COA: `COA/${d(6)}`, SAHPRA_LICENCE: `SAHPRA/W/${d(5)}` }[kind];
  };
  const addLicence = (a: SimAccount, kind: TradeLicenceKind, when: Date, expiresAt: Date | null, review: Date | null) => {
    const id = uid(), uploadId = uid(), number = licenceNumber(a, kind);
    const remind = expiresAt && expiresAt.getTime() - LICENCE_REMIND_DAYS * DAY;
    tradeLicenceRows.push({
      id, tradeAccountId: a.id, kind, number, expiresAt, uploadId, status: review ? "VERIFIED" : "SUBMITTED", submittedById: a.buyers[0].id, createdAt: when,
      reviewedAt: review, reviewedById: review ? (hqNaledi.id as string) : null, remindedAt: review && remind && remind < NOW.getTime() ? at(dayKey(new Date(remind)), 6 * 60 + 5) : null,
    });
    licenceDocs.push({ uploadId, account: a, kind, number, expiresAt, at: when });
    if (review) tradeAudit.push({ id: uid(), at: review, ...hqActor(hqNaledi), action: "trade.licence.verify", entity: "TradeLicence", entityId: id, data: { account: a.number, kind, number, expiresAt } });
    return { kind, number, expiresAt };
  };
  for (const [i, d] of ACCOUNTS.entries()) {
    const id = uid();
    const number = tradeAccountNumber(i + 1);
    const applied = at(keyOf(d.applied), 9 * 60 + int(0, 8 * 60));
    const approvedAt = d.status === "PENDING" ? null : at(keyOf(d.applied - (d.approvedDays ?? 2)), 10 * 60 + int(0, 6 * 60));
    const province = d.address[3];
    const dc = stores.find((s) => s.kind === "WAREHOUSE" && s.province === province)!;
    const classes = d.classes ?? (d.kind === "PHARMACY" || d.kind === "PRACTICE" ? HEALTH_CLASSES : d.kind === "CAFE" ? CAFE_CLASSES : TRADE_CLASSES);
    const buyers: SimBuyer[] = d.buyers.map(([name, email, phone, role]) => ({ id: uid(), name, email, phone, role }));
    const heldAt = d.heldAgo != null ? at(keyOf(d.heldAgo), d.holdReason === "overdue" ? 2 * 60 + 5 : 11 * 60 + 40) : null;
    const closedAt = d.closedAgo != null ? at(keyOf(d.closedAgo), 14 * 60 + 20) : null;
    const a: SimAccount = {
      id, number, name: d.name, legalName: d.legalName, kind: d.kind, regNumber: d.reg ?? null, vatNumber: d.vat ?? null, email: d.email, phone: d.phone,
      addressLine: d.address[0], suburb: d.address[1], city: d.address[2], province, postalCode: d.address[4], delivery: d.delivery ?? null,
      status: d.status, terms: d.terms ?? "PREPAID", creditLimitCents: d.terms === "ACCOUNT" ? d.limit! : 0, paymentDays: 30, classes, dc, priceListId: d.ownList ? plTrade : null,
      notes: d.notes ?? null, applied, approvedAt, holdReason: d.holdReason ?? null, heldAt, closedAt, buyers, ref: d.ref, rate: d.rate ?? 2 / 22, balance: 0, open: 0, reserve: d.reserve ?? 0,
    };
    tradeAccounts.push(a);
    tradeAccountRows.push({
      id, number, name: a.name, legalName: a.legalName, kind: a.kind, regNumber: a.regNumber, vatNumber: a.vatNumber, email: a.email, phone: a.phone,
      addressLine: a.addressLine, suburb: a.suburb, city: a.city, province, postalCode: a.postalCode,
      deliveryLine: a.delivery?.[0] ?? null, deliverySuburb: a.delivery?.[1] ?? null, deliveryCity: a.delivery?.[2] ?? null, deliveryProvince: a.delivery?.[3] ?? null, deliveryPostalCode: a.delivery?.[4] ?? null,
      status: a.status, terms: a.terms, paymentDays: a.paymentDays, creditLimitCents: a.creditLimitCents, classes, priceListId: a.priceListId, dcId: dc.id, notes: a.notes,
      adultAttestedAt: applied, termsVersion: TRADE.termsVersion, termsAcceptedAt: applied, approvedAt, approvedById: approvedAt ? (hqNaledi.id as string) : null, holdReason: a.holdReason,
      createdAt: applied, updatedAt: closedAt ?? heldAt ?? approvedAt ?? applied,
    });
    const expiry = PRACTICE_EXPIRY[a.name];
    const licences = requiredLicences(a.kind, classes, !!a.regNumber).map(({ kind }, j) =>
      addLicence(a, kind, applied, TRADE_LICENCES[kind].expires ? expiryOf(keyOf(-(expiry ?? 240))) : null, approvedAt && new Date(approvedAt.getTime() - (30 - 4 * j) * 60_000)),
    );
    if (expiry === 9) {
      const renewal = at(keyOf(1), 14 * 60 + 10);
      const l = addLicence(a, "PRACTICE_NUMBER", renewal, expiryOf(keyOf(-(expiry + 365))), null);
      tradeAudit.push({ id: uid(), at: renewal, ...buyerActor(buyers[0]), action: "trade.licence.submit", entity: "TradeLicence", entityId: tradeLicenceRows.at(-1)!.id!, data: { account: number, ...l } });
    }
    if (d.holdReason?.includes("CIPC")) {
      const sent = at(keyOf(2), 10 * 60 + 30);
      const l = addLicence(a, "CIPC_REGISTRATION", sent, null, null);
      tradeAudit.push({ id: uid(), at: sent, ...buyerActor(buyers[0]), action: "trade.licence.submit", entity: "TradeLicence", entityId: tradeLicenceRows.at(-1)!.id!, data: { account: number, ...l } });
    }
    tradeAudit.push({ id: uid(), at: applied, ...buyerActor(buyers[0]), action: "trade.apply", entity: "TradeAccount", entityId: id, data: { number, kind: a.kind, classes, licences, termsVersion: TRADE.termsVersion, source: "portal" } });
    if (approvedAt) tradeAudit.push({ id: uid(), at: approvedAt, ...hqActor(hqNaledi), action: "trade.account.approve", entity: "TradeAccount", entityId: id, data: { number, from: "PENDING", terms: a.terms, creditLimitCents: a.creditLimitCents, paymentDays: a.paymentDays, classes } });
    if (heldAt) tradeAudit.push({ id: uid(), at: heldAt, ...(a.holdReason === "overdue" ? { actorType: "SYSTEM", actorName: "System" } : hqActor(hqNaledi)), action: "trade.account.hold", entity: "TradeAccount", entityId: id, data: { number, reason: a.holdReason } });
    if (closedAt) tradeAudit.push({ id: uid(), at: closedAt, ...hqActor(hqNaledi), action: "trade.account.close", entity: "TradeAccount", entityId: id, data: { number, reason: a.holdReason } });
  }
  /** The account's status as it was at `ts` (approved accounts were pending first; holds and closures came later). */
  const statusAt = (a: SimAccount, ts: Date): SimAccount["status"] =>
    !a.approvedAt || a.approvedAt > ts ? "PENDING" : a.closedAt && a.closedAt <= ts ? "CLOSED" : a.heldAt && a.heldAt <= ts ? "ON_HOLD" : "APPROVED";

  // ── Selling ─────────────────────────────────────────────────────────────
  const sales: Prisma.SaleCreateManyInput[] = [];
  const saleLines: Prisma.SaleLineCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const shifts: Prisma.ShiftCreateManyInput[] = [];
  const orders: Prisma.OrderCreateManyInput[] = [];
  const orderLines: Prisma.OrderLineCreateManyInput[] = [];
  type Stat = Omit<Prisma.DailyStoreStatCreateManyInput, "storeId" | "date" | "channel"> & Record<string, number>;
  const storeStats = new Map<string, { storeId: string; date: string; channel: "POS" | "ONLINE" | "WHOLESALE"; s: Stat }>();
  const variantStats = new Map<string, { storeId: string; date: string; variantId: string; units: number; netCents: number; costCents: number }>();
  const sold14 = new Map<string, number[]>(); // store|variant → units per day index
  const THC_CATS = ["flower", "pre-rolls", "edibles", "vapes", "concentrates"];
  const CAT_W: [string, number][] = [
    ["flower", 0.5], ["pre-rolls", 0.15], ["edibles", 0.08], ["vapes", 0.08], ["concentrates", 0.04], ["wellness", 0.065], ["coffee-drinks", 0.035], ["protein-nutrition", 0.015],
    ["skin-care", 0.03], ["collagen-supplements", 0.01], ["accessories", 0.09], ["grow", 0.02], ["apparel", 0.025],
  ];
  const variantsIn = (catSlug: string) => variants.filter((v) => v.cat === catSlug);
  const campaignSends: { id: string; ts: Date; promoId?: string }[] = [];
  const heritageCampaignId = uid(), winbackCampaignId = uid(), balmCampaignId = uid();
  const winbackSend = at(keyOf(20), 10 * 60);
  campaignSends.push({ id: winbackCampaignId, ts: winbackSend, promoId: winbackPromoId });
  if (sep1 > daysAgo(DAYS)) campaignSends.push({ id: heritageCampaignId, ts: at(dayKey(sep1), 9 * 60 + 30), promoId: heritagePromoId });

  function bump(storeId: string, date: string, channel: "POS" | "ONLINE" | "WHOLESALE", d: Record<string, number>) {
    const key = `${storeId}|${date}|${channel}`;
    const row = storeStats.get(key) ?? { storeId, date, channel, s: {} as Stat };
    for (const [k, v] of Object.entries(d)) row.s[k] = (row.s[k] ?? 0) + v;
    storeStats.set(key, row);
  }

  const gramsIn30 = (c: SimCustomer, ts: number) => c.auth!.grams.filter((g) => g.ts > ts - 30 * DAY).reduce((s, g) => s + g.g, 0);
  const authActive = (c: SimCustomer | null, ts: Date) => !!c?.auth && c.auth.from <= ts && c.auth.to >= ts;

  function buildBasket(storeId: string, c: SimCustomer | null, ts: Date, channel: "POS" | "COLLECT" | "SAME_DAY" | "COURIER") {
    const s = byStoreId.get(storeId)!;
    const thcOK = authActive(c, ts) && channel !== "SAME_DAY" && channel !== "COURIER";
    const cats = CAT_W.filter(([k]) => thcOK || !THC_CATS.includes(k));
    const n = weighted([[1, 0.55], [2, 0.33], [3, 0.12]] as const);
    const lines: { v: SimVariant; qty: number }[] = [];
    let grams = c?.auth ? gramsIn30(c, ts.getTime()) : 0;
    for (let i = 0; i < n; i++) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const catSlug = weighted(thcOK && i === 0 ? cats.filter(([k]) => THC_CATS.includes(k)).concat([["wellness", 0.05]]) : cats);
        const pool = variantsIn(catSlug).filter((v) => s.kind === "WAREHOUSE" || ranged.has(lk(storeId, v.id)));
        if (!pool.length) continue;
        const v = weighted(pool.map((x) => [x, (x.featured ? 1.8 : 1) * (x.label === "3.5g" ? 1.5 : x.label === "7g" ? 0.35 : 1) * Math.pow(30000 / Math.max(x.price, 3000), 0.9)] as const));
        if (lines.some((l) => l.v.id === v.id)) continue;
        const qty = chance(0.9) ? 1 : 2;
        if (available(storeId, v.id, ts) < qty) continue;
        if (v.reg === "THC") {
          if (!c?.auth || grams + (v.grams ?? 0) * qty > c.auth.limit) continue;
          grams += (v.grams ?? 0) * qty;
        }
        lines.push({ v, qty });
        break;
      }
    }
    return lines;
  }

  // Instant Rewards pricing, as resolvePrice does it: members pay their tier % less, or this week's Rewards deal price
  // when that's lower. Never on medicines (s18A): licensed products, and CBD supplements until counsel clears them.
  const DEAL_SLUGS = ["herbal-holland-cbd-coffee", "rooibos-cbd-tea", "sunset-grinder", "windmill-rolling-tray", "hemp-hand-cream"];
  const dealFrom = daysAgo(5);
  const deals = new Map(variants.filter((v) => DEAL_SLUGS.includes(v.slug)).map((v) => [v.id, Math.round((v.price * 0.8) / 100) * 100 - 1]));
  const memberUnit = (base: number, v: SimVariant, c: SimCustomer | null, ts: Date) => {
    if (!c || NO_INCENTIVES.includes(v.reg)) return base;
    const tier = Math.round((base * (100 - DEFAULT_TIER_SAVINGS[c.tier])) / 100);
    const deal = ts >= dealFrom ? deals.get(v.id) : undefined;
    return deal != null && deal < tier ? deal : tier;
  };

  type Tender = { method: "CARD" | "CASH" | "PAYSHAP" | "EFT" | "LOYALTY" | "ONLINE"; amountCents: number; tenderedCents?: number; changeCents?: number; provider?: string; reference?: string; cardBrand?: string; cardLast4?: string };
  function post(o: {
    store: SimStore; c: SimCustomer | null; ts: Date; lines: { v: SimVariant; qty: number }[]; channel: "POS" | "ONLINE"; orderId?: string; number: string;
    staffId?: string | null; shiftId?: string | null; code?: string | null; extraCents?: number; tenders?: Tender[] | "AUTO"; campaignId?: string | null;
  }) {
    const { store: s, c, ts } = o;
    const zone = o.channel === "POS" && s.code === "CPT01" ? 1.05 : 1;
    const priced = o.lines.map(({ v, qty }) => {
      const r = ranged.get(lk(s.id, v.id));
      const base = o.channel === "POS" ? (r?.price ?? Math.round(v.price * zone)) : v.price;
      const unit = memberUnit(base, v, c, ts);
      return { v, qty, unit, noPromo: NO_INCENTIVES.includes(v.reg), saved: (base - unit) * qty };
    });
    const saved = priced.reduce((a, p) => a + p.saved, 0);
    const promos = promosAt(ts, o.channel, s.id);
    const pr = applyPromotions(priced.map((p) => ({ key: p.v.id, productId: p.v.productId, categoryId: catId[p.v.cat], qty: p.qty, unitPriceCents: p.unit, noPromo: p.noPromo })), promos, o.code);
    const code = o.code && !pr.codeError ? o.code : null;
    const extra = o.extraCents ?? 0;
    const total = pr.totalCents + extra;
    const lineVat = (cents: number) => (s.vendor ? vatOf(cents) : 0);
    const saleId = uid();
    let cost = 0, units = 0, noEarnTotal = 0;
    const date = dayKey(ts);
    for (const [i, p] of priced.entries()) {
      const allocations = take(s.id, p.v.id, p.qty, o.channel === "POS" ? "SALE" : "ONLINE", ts, { saleId, orderId: o.orderId, userId: o.staffId ?? undefined });
      const lc = allocations.reduce((a, x) => a + x.qty * x.unitCostCents, 0);
      cost += lc;
      units += p.qty;
      const lt = pr.lines[i].totalCents;
      if (p.noPromo) noEarnTotal += lt;
      saleLines.push({ id: uid(), saleId, variantId: p.v.id, qty: p.qty, unitPriceCents: p.unit, discountCents: pr.lines[i].discountCents, memberSavingsCents: p.saved, totalCents: lt, vatCents: lineVat(lt), costCents: lc, allocations });
      const vk = `${s.id}|${date}|${p.v.id}`;
      const vs = variantStats.get(vk) ?? { storeId: s.id, date, variantId: p.v.id, units: 0, netCents: 0, costCents: 0 };
      vs.units += p.qty;
      vs.netCents += lt - lineVat(lt);
      vs.costCents += lc;
      variantStats.set(vk, vs);
      const hist = sold14.get(lk(s.id, p.v.id)) ?? [];
      hist.push(ts.getTime());
      sold14.set(lk(s.id, p.v.id), hist);
      if (p.v.reg === "THC" && c?.auth) c.auth.grams.push({ ts: ts.getTime(), g: (p.v.grams ?? 0) * p.qty });
    }
    // Tenders
    const tenders: Tender[] = [];
    let redeem = 0;
    if (o.tenders === "AUTO" || !o.tenders) {
      if (c && c.points >= 60 && chance(0.13)) redeem = Math.min(c.points, Math.floor((total * 0.5) / 100));
      const rest = total - redeem * 100;
      if (rest > 0) {
        const m = weighted([["CARD", 0.56], ["CASH", 0.22], ["PAYSHAP", 0.14], ["EFT", 0.02]] as const);
        const t: Tender = { method: m, amountCents: rest };
        if (m === "CASH") {
          const step = pick([1000, 5000, 10000, 20000]);
          t.tenderedCents = Math.ceil(rest / step) * step;
          t.changeCents = t.tenderedCents - rest;
        } else if (m === "CARD") Object.assign(t, { provider: "HALO_DOT", reference: `HALO${int(10000000, 99999999)}`, cardBrand: weighted([["Visa", 0.55], ["Mastercard", 0.42], ["Amex", 0.03]] as const), cardLast4: String(int(1000, 9999)) });
        else if (m === "PAYSHAP") Object.assign(t, { provider: "PAYSHAP", reference: `PS${int(100000000, 999999999)}` });
        tenders.push(t);
      }
    } else tenders.push(...o.tenders.filter((t) => t.method !== "LOYALTY"));
    const preRedeemed = o.tenders && o.tenders !== "AUTO" ? (o.tenders.find((t) => t.method === "LOYALTY")?.amountCents ?? 0) / 100 : 0;
    const loyaltyPts = redeem || preRedeemed;
    if (loyaltyPts) tenders.push({ method: "LOYALTY", amountCents: loyaltyPts * 100 });
    const payRows = tenders.map((t) => ({ id: uid(), saleId, ...t, createdAt: ts }));
    payments.push(...payRows);

    let earned = 0;
    if (c) {
      if (redeem) {
        c.points -= redeem;
        loyalty.push({ id: uid(), customerId: c.id, storeId: s.id, points: -redeem, kind: "REDEEM", saleId, createdAt: ts });
      }
      c.spend.push({ ts: ts.getTime(), cents: total });
      const spend12 = c.prior12m + c.spend.reduce((a, x) => a + x.cents, 0);
      const before = c.tier;
      c.tier = tierFor(spend12).key;
      earned = pointsFor(Math.max(0, total - loyaltyPts * 100 - noEarnTotal), c.tier, pr.pointsMultiplier);
      if (earned) {
        c.points += earned;
        loyalty.push({ id: uid(), customerId: c.id, storeId: s.id, points: earned, kind: "EARN", saleId, orderId: o.orderId, createdAt: ts });
      }
      if (c.visits === 0 && c.referredById) {
        const ref = customerById.get(c.referredById);
        loyalty.push({ id: uid(), customerId: c.id, storeId: s.id, points: 50, kind: "REFERRAL", createdAt: ts, note: "Welcome: you were referred" });
        c.points += 50;
        if (ref) {
          loyalty.push({ id: uid(), customerId: ref.id, storeId: s.id, points: 50, kind: "REFERRAL", createdAt: ts, note: `Referral: ${c.firstName}` });
          ref.points += 50;
        }
      }
      if (before !== c.tier && c.tier !== "SEED") loyalty.push({ id: uid(), customerId: c.id, storeId: s.id, points: 0, kind: "BONUS", createdAt: ts, note: `Tier up: ${c.tier}` });
      c.visits++;
      c.lifetime += total;
      c.first = c.first ?? ts;
      c.last = ts;
    }
    const campaignId = o.campaignId ?? campaignSends.find((x) => x.promoId && pr.applied.some((a) => a.id === x.promoId) && ts >= x.ts)?.id ?? null;
    const ageRestricted = priced.some((p) => (DEFAULT_COMPLIANCE.ageRestricted as string[]).includes(p.v.reg));
    const vat = priced.reduce((a, _, i) => a + lineVat(pr.lines[i].totalCents), 0) + lineVat(extra);
    sales.push({
      id: saleId, number: o.number, storeId: s.id, channel: o.channel, orderId: o.orderId, shiftId: o.shiftId, staffId: o.staffId, deviceId: o.channel === "POS" ? s.deviceId : null,
      customerId: c?.id, subtotalCents: pr.subtotalCents + extra, discountCents: pr.discountCents, memberSavingsCents: saved, totalCents: total, vatCents: vat, costCents: cost, pointsEarned: earned,
      promoCode: code, promotionId: pr.applied[0]?.id ?? null, campaignId, ageCheck: !ageRestricted ? "NONE" : c ? c.ageCheck : "ID_SIGHTED",
      invoiceEmail: c?.email ?? null, invoiceSentAt: c?.email ? ts : null, createdAt: ts, syncedAt: ts,
    });
    const d: Record<string, number> = { sales: 1, units, grossCents: total, vatCents: vat, costCents: cost, discountCents: pr.discountCents, memberSavingsCents: saved, members: c ? 1 : 0, pointsIssued: earned };
    const col = { CARD: "cardCents", CASH: "cashCents", PAYSHAP: "payshapCents", EFT: "eftCents", LOYALTY: "loyaltyCents", ONLINE: "onlineCents" } as const;
    for (const t of tenders) d[col[t.method]] = (d[col[t.method]] ?? 0) + t.amountCents;
    bump(s.id, date, o.channel, d);
    return { saleId, total, pr, noEarnTotal, payRows };
  }

  // ── Trade (wholesale) selling: portal orders fulfilled by the DC or a store, and trade sales rung up at a till ──────
  // Mirrors src/server/trade/orders.ts and sales.ts postSaleTx for channel WHOLESALE: ex-VAT unit prices with VAT per
  // line (half up), the account's buyer block on the sale, one ACCOUNT or EFT tender, FEFO lots, the TI-… tax invoice
  // as the sale number and the INVOICE on the account's ledger. Money HQ collected for an order (the EFT, or HQ's own
  // ledger on account) rolls up under onlineCents; a till's tenders keep their own columns (ACCOUNT → accountCents).
  const tradeOrderRows: Prisma.TradeOrderCreateManyInput[] = [];
  const tradeOrderLineRows: Prisma.TradeOrderLineCreateManyInput[] = [];
  const ledgerRows: Prisma.TradeLedgerEntryCreateManyInput[] = [];
  type Scheduled = { at: Date; row: Prisma.TradeLedgerEntryCreateManyInput; account: SimAccount; applied: boolean };
  const scheduledLedger: Scheduled[] = [];
  type Invoiced = { postedAt: Date; sale: Prisma.SaleCreateManyInput; order: Prisma.TradeOrderCreateManyInput; entry: Prisma.TradeLedgerEntryCreateManyInput; account: SimAccount; orderId: string; payment?: Scheduled };
  const invoiced: Invoiced[] = [];
  let tradeOrderSeq = 0, tradeTillSales = 0, eftOrders = 0, shortShipped = false;
  const iso = (d: Date) => d.toISOString();
  const lineName = (v: SimVariant) => `${v.name} · ${v.label}`;
  const buyerBlockOf = (a: SimAccount) => tradeBuyerBlock({ legalName: a.legalName, name: a.name, vatNumber: a.vatNumber, addressLine: a.addressLine, suburb: a.suburb, city: a.city, postalCode: a.postalCode });
  const johanId = hqJohan.id as string;

  /** A ledger entry now; the account's running balance (what it owes) moves with it. */
  function ledger(a: SimAccount, row: Omit<Prisma.TradeLedgerEntryCreateManyInput, "id" | "tradeAccountId">) {
    const entry: Prisma.TradeLedgerEntryCreateManyInput = { id: uid(), tradeAccountId: a.id, ...row };
    ledgerRows.push(entry);
    a.balance += row.cents;
    return entry;
  }
  /** A payment the account will make later: applied when the clock reaches it, never if that is after now. */
  function schedulePayment(a: SimAccount, cents: number, reference: string, when: Date, tradeOrderId: string | null): Scheduled {
    const s: Scheduled = { at: when, account: a, applied: false, row: { id: uid(), tradeAccountId: a.id, kind: "PAYMENT", cents: -cents, reference, tradeOrderId, note: null, createdById: johanId, createdAt: when } };
    scheduledLedger.push(s);
    return s;
  }
  /**
   * How invoices get paid: a third of businesses run a weekly payment run (within a fortnight), most of the rest pay a
   * few days before an invoice falls due, some a few days late (inside the grace period), and a few haven't yet.
   */
  function planPayment(a: SimAccount, cents: number, reference: string, dueAt: Date, postedAt: Date, tradeOrderId: string | null, mode: "random" | "prompt" | "ontime" | "never" = "random") {
    if (mode === "never") return undefined;
    const r = mode === "ontime" ? 0.5 : mode === "prompt" ? 0.1 : R();
    let payAt: Date;
    if (r < 0.35) payAt = addDays(postedAt, int(3, 12));
    else if (r < 0.8) payAt = addDays(dueAt, -int(1, 9));
    else if (r < 0.93 || addDays(dueAt, TRADE.overdueGraceDays) <= NOW) payAt = addDays(dueAt, int(1, 6));
    else return undefined; // not paid yet, and not past the grace period either, so the daily job leaves the account alone
    if (payAt < addDays(postedAt, 2)) payAt = addDays(postedAt, 2);
    payAt = at(dayKey(payAt), 9 * 60 + 40 + int(0, 300));
    return schedulePayment(a, cents, reference, payAt, tradeOrderId);
  }
  function applyScheduled(until: Date) {
    for (const s of scheduledLedger) {
      if (s.applied || s.at > until) continue;
      s.applied = true;
      ledgerRows.push(s.row);
      s.account.balance += s.row.cents;
      tradeAudit.push({ id: uid(), at: s.at, ...hqActor(hqJohan), action: "trade.payment", entity: "TradeAccount", entityId: s.account.id, data: { number: s.account.number, cents: -s.row.cents, reference: s.row.reference } });
    }
  }

  type TradeTender = { method: "ACCOUNT" | "EFT" | "CASH" | "CARD"; reference?: string; provider?: string; cardBrand?: string; cardLast4?: string; tenderedCents?: number; changeCents?: number };
  type OrderLine = { v: SimVariant; qty: number; unit: number; ship?: number };
  /** The WHOLESALE sale (postSaleTx): lines ex VAT + VAT per line, the extras (courier or handling) as VAT-inclusive cents, one tender. */
  function postTrade(o: { store: SimStore; account: SimAccount; ts: Date; lines: OrderLine[]; number: string; extraEx?: number; tender: TradeTender; collectedByHq: boolean; staffId?: string | null; shiftId?: string | null; deviceId?: string | null; ageCheck: "NONE" | "ID_SIGHTED"; note?: string }) {
    const { store: s, account: a, ts } = o;
    const saleId = uid();
    const date = dayKey(ts);
    const extraEx = o.extraEx ?? 0;
    const extra = extraEx + vatHalfUp(extraEx);
    const allocs = new Map<string, { batchId: string; qty: number }[]>();
    let cost = 0, units = 0, linesIncl = 0, lineVat = 0;
    for (const l of o.lines) {
      const { exCents, vatCents, inclCents } = tradeLine({ unitCents: l.unit, qty: l.qty });
      const allocations = take(s.id, l.v.id, l.qty, "SALE", ts, { saleId, userId: o.staffId ?? undefined });
      allocs.set(l.v.id, allocations.map((x) => ({ batchId: x.batchId, qty: x.qty })));
      const lc = allocations.reduce((x, y) => x + y.qty * y.unitCostCents, 0);
      cost += lc; units += l.qty; linesIncl += inclCents; lineVat += vatCents;
      saleLines.push({ id: uid(), saleId, variantId: l.v.id, qty: l.qty, unitPriceCents: l.unit, discountCents: 0, memberSavingsCents: 0, totalCents: inclCents, vatCents, costCents: lc, allocations });
      const vk = `${s.id}|${date}|${l.v.id}`;
      const vs = variantStats.get(vk) ?? { storeId: s.id, date, variantId: l.v.id, units: 0, netCents: 0, costCents: 0 };
      vs.units += l.qty; vs.netCents += exCents; vs.costCents += lc;
      variantStats.set(vk, vs);
    }
    const total = linesIncl + extra;
    const vat = lineVat + vatOf(extra);
    const sale: Prisma.SaleCreateManyInput = {
      id: saleId, number: o.number, storeId: s.id, channel: "WHOLESALE", shiftId: o.shiftId ?? null, staffId: o.staffId ?? null, deviceId: o.deviceId ?? null, customerId: null, tradeAccountId: a.id,
      subtotalCents: total, discountCents: 0, memberSavingsCents: 0, totalCents: total, vatCents: vat, costCents: cost, pointsEarned: 0, ageCheck: o.ageCheck, buyer: buyerBlockOf(a),
      note: o.note, invoiceEmail: a.email, invoiceSentAt: ts, createdAt: ts, syncedAt: ts,
    };
    sales.push(sale);
    payments.push({ id: uid(), saleId, ...o.tender, amountCents: total, createdAt: ts });
    const col = o.collectedByHq ? "onlineCents" : ({ ACCOUNT: "accountCents", EFT: "eftCents", CASH: "cashCents", CARD: "cardCents" } as const)[o.tender.method];
    bump(s.id, date, "WHOLESALE", { sales: 1, units, grossCents: total, vatCents: vat, costCents: cost, discountCents: 0, memberSavingsCents: 0, members: 0, pointsIssued: 0, [col]: total });
    return { saleId, sale, total, vat, cost, units, allocs };
  }

  type Steps = { confirmAt?: Date | null; cancelAt?: Date | null; pickAt?: Date | null; readyAt?: Date | null; postAt?: Date | null };
  type TradeEvent = { status: string; at: string; note?: string };
  const minuteOf = (d: Date) => (d.getTime() - midnight(dayKey(d)).getTime()) / 60_000;
  const nextMorning = (d: Date, minute: number) => {
    let k = dayKey(new Date(d.getTime() + DAY));
    while (weekday(k) === 0) k = dayKey(new Date(midnight(k).getTime() + DAY));
    return at(k, minute);
  };
  /**
   * When each step happens, as the DC and the stores work: an EFT is confirmed the next business morning (or the
   * order lapses after the hold period, cancelled by the daily job at 02:00), the DC picks the same afternoon or the
   * next morning and ships within hours; a store packs a collect order within the hour and the buyer fetches it
   * within a day or so. Any step after now hasn't happened yet.
   */
  function tradeSteps(placedAt: Date, payMethod: "EFT" | "ACCOUNT", fulfilment: "COURIER" | "COLLECT", lapse = false): Steps {
    if (payMethod === "EFT" && lapse) return { cancelAt: at(dayKey(addDays(placedAt, TRADE.eftHoldDays)), 26 * 60 + 10) };
    const confirmAt = payMethod === "EFT" ? nextMorning(placedAt, 10 * 60 + 30 + int(0, 120)) : null;
    const reserved = confirmAt ?? placedAt;
    const pickAt = fulfilment === "COLLECT"
      ? (minuteOf(reserved) < 17 * 60 ? new Date(reserved.getTime() + int(20, 90) * 60_000) : nextMorning(reserved, 9 * 60 + 30 + int(0, 60)))
      : (minuteOf(reserved) < 11 * 60 ? new Date(reserved.getTime() + int(150, 240) * 60_000) : nextMorning(reserved, 9 * 60 + int(0, 90)));
    if (fulfilment === "COURIER") return { confirmAt, pickAt, postAt: new Date(pickAt.getTime() + int(80, 200) * 60_000) };
    const readyAt = new Date(pickAt.getTime() + int(15, 60) * 60_000);
    let collectAt = new Date(readyAt.getTime() + int(2, 30) * 3_600_000);
    if (minuteOf(collectAt) > 18 * 60 || minuteOf(collectAt) < 9 * 60) collectAt = nextMorning(readyAt, 10 * 60 + int(0, 300));
    return { confirmAt, pickAt, readyAt, postAt: collectAt };
  }

  /** Places an order and walks it through the steps that have happened: the rows, events, stock, sale, ledger and audit the services would leave. */
  function placeTradeOrder(o: { account: SimAccount; buyer: SimBuyer | null; store: SimStore; fulfilment: "COURIER" | "COLLECT"; payMethod: "EFT" | "ACCOUNT"; lines: OrderLine[]; placedAt: Date; steps: Steps; reference?: string | null; notes?: string | null; pay?: "random" | "prompt" | "ontime" | "never" }) {
    const { account: a, store: s, placedAt, steps } = o;
    const id = uid();
    const number = tradeOrderNumber(++tradeOrderSeq);
    const lineTotals = o.lines.map((l) => tradeLine({ unitCents: l.unit, qty: l.qty }));
    const deliveryCents = o.fulfilment === "COURIER" ? tradeDelivery(lineTotals.reduce((x, l) => x + l.exCents, 0), TRADE) : 0;
    const handlingCents = o.fulfilment === "COLLECT" ? tradeHandling(TRADE) : 0;
    const totals = tradeTotals(lineTotals, { deliveryCents, handlingCents });
    const eft = o.payMethod === "EFT";
    const placedBy = o.buyer ? buyerActor(o.buyer) : hqActor(hqPieter);
    const worker = s.kind === "WAREHOUSE" ? hqActor(hqPieter) : { actorType: "USER", actorId: s.staff[0].id, actorName: s.staff[0].name };
    const addr = o.fulfilment === "COLLECT" ? null : a.delivery ? { addressLine: a.delivery[0], suburb: a.delivery[1], city: a.delivery[2], province: a.delivery[3], postalCode: a.delivery[4] } : { addressLine: a.addressLine, suburb: a.suburb, city: a.city, province: a.province, postalCode: a.postalCode };
    let status: "PENDING_PAYMENT" | "PLACED" | "PICKING" | "READY" | "SHIPPED" | "COLLECTED" | "CANCELLED" = eft ? "PENDING_PAYMENT" : "PLACED";
    const events: TradeEvent[] = [{ status, at: iso(placedAt), note: eft ? `Pro forma sent; payment expected within ${TRADE.eftHoldDays} days` : "Placed on account; stock reserved" }];
    tradeAudit.push({ id: uid(), at: placedAt, ...placedBy, storeId: s.id, action: "trade.order", entity: "TradeOrder", entityId: id, data: { number, account: a.number, payMethod: o.payMethod, fulfilment: o.fulfilment, total: totals.totalCents, status } });
    const row: Prisma.TradeOrderCreateManyInput = {
      id, number, tradeAccountId: a.id, buyerId: o.buyer?.id ?? null, storeId: s.id, fulfilment: o.fulfilment, status, payMethod: o.payMethod,
      subtotalCents: totals.subtotalCents, deliveryCents, handlingCents, vatCents: totals.vatCents, totalCents: totals.totalCents, ...(addr ?? {}),
      collectionCode: o.fulfilment === "COLLECT" ? String(int(100000, 999999)) : null, reference: o.reference ?? null, notes: o.notes ?? null,
      events, reservedAt: eft ? null : placedAt, createdAt: placedAt, updatedAt: placedAt,
    };
    const touch = (d: Date) => (row.updatedAt = d);
    if (!eft) a.open += totals.totalCents;
    if (eft) {
      if (steps.cancelAt && steps.cancelAt <= NOW) {
        status = "CANCELLED";
        row.cancelledAt = steps.cancelAt;
        touch(steps.cancelAt);
        events.push({ status, at: iso(steps.cancelAt), note: `Payment not received within ${TRADE.eftHoldDays} days` });
        tradeAudit.push({ id: uid(), at: steps.cancelAt, actorType: "SYSTEM", actorName: "System", storeId: s.id, action: "trade.order.cancelled", entity: "TradeOrder", entityId: id, data: { number } });
      } else if (steps.confirmAt && steps.confirmAt <= NOW) {
        const ref = eftReference(number);
        status = "PLACED";
        Object.assign(row, { paymentRef: ref, paidAt: steps.confirmAt, reservedAt: steps.confirmAt });
        touch(steps.confirmAt);
        events.push({ status, at: iso(steps.confirmAt), note: `EFT confirmed (ref ${ref}); stock reserved` });
        ledger(a, { kind: "PAYMENT", cents: -totals.totalCents, reference: ref, tradeOrderId: id, note: `EFT for ${number}`, createdById: johanId, createdAt: steps.confirmAt });
        tradeAudit.push({ id: uid(), at: steps.confirmAt, ...hqActor(hqJohan), storeId: s.id, action: "trade.order.paid", entity: "TradeOrder", entityId: id, data: { number, reference: ref, cents: totals.totalCents } });
      }
    }
    let posted: ReturnType<typeof postTrade> | null = null;
    if (status === "PLACED" && steps.pickAt && steps.pickAt <= NOW) {
      status = "PICKING";
      touch(steps.pickAt);
      events.push({ status, at: iso(steps.pickAt) });
      tradeAudit.push({ id: uid(), at: steps.pickAt, ...worker, storeId: s.id, action: "trade.order.picking", entity: "TradeOrder", entityId: id, data: { number } });
      if (o.fulfilment === "COLLECT" && steps.readyAt && steps.readyAt <= NOW) {
        status = "READY";
        row.readyAt = steps.readyAt;
        touch(steps.readyAt);
        events.push({ status, at: iso(steps.readyAt) });
        tradeAudit.push({ id: uid(), at: steps.readyAt, ...worker, storeId: s.id, action: "trade.order.ready", entity: "TradeOrder", entityId: id, data: { number } });
      }
      const canPost = o.fulfilment === "COURIER" ? status === "PICKING" : status === "READY";
      if (canPost && steps.postAt && steps.postAt <= NOW) {
        const postAt = steps.postAt;
        const shortNotes = o.lines.filter((l) => l.ship != null && l.ship < l.qty).map((l) => `${lineName(l.v)}: ${l.ship} of ${l.qty}`);
        posted = postTrade({
          store: s, account: a, ts: postAt, lines: o.lines.map((l) => ({ v: l.v, qty: l.ship ?? l.qty, unit: l.unit })).filter((l) => l.qty > 0), number: `TI-${id}`,
          extraEx: deliveryCents + handlingCents, tender: eft ? { method: "EFT", reference: row.paymentRef as string, provider: "Trade EFT" } : { method: "ACCOUNT" },
          collectedByHq: true, staffId: s.kind === "RETAIL" ? s.staff[0].id : (hqPieter.id as string), ageCheck: o.fulfilment === "COLLECT" ? "ID_SIGHTED" : "NONE", note: `Trade order ${number}`,
        });
        status = o.fulfilment === "COURIER" ? "SHIPPED" : "COLLECTED";
        touch(postAt);
        events.push({ status, at: iso(postAt), ...(shortNotes.length ? { note: `Short: ${shortNotes.join("; ")}` } : {}) });
        const dueAt = eft ? postAt : addDays(postAt, a.paymentDays);
        const entry = ledger(a, { kind: "INVOICE", cents: posted.total, reference: `TI-${id}`, tradeOrderId: id, saleId: posted.saleId, dueAt, note: `${o.fulfilment === "COURIER" ? "Shipped" : "Collected"} ${number}`, createdById: worker.actorId, createdAt: postAt });
        const inv: Invoiced = { postedAt: postAt, sale: posted.sale, order: row, entry, account: a, orderId: id };
        if (!eft) {
          a.open -= totals.totalCents;
          inv.payment = planPayment(a, posted.total, `${a.ref} ${number}`, dueAt, postAt, id, o.pay);
        }
        invoiced.push(inv);
        row.saleId = posted.saleId;
        if (o.fulfilment === "COURIER") Object.assign(row, { shippedAt: postAt, courier: "The Courier Guy", trackingNo: `TCG${int(10000000, 99999999)}` });
        else row.collectedAt = postAt;
        tradeAudit.push({ id: uid(), at: postAt, ...worker, storeId: s.id, action: `trade.order.${status.toLowerCase()}`, entity: "TradeOrder", entityId: id, data: { number, saleId: posted.saleId, ...(shortNotes.length ? { short: shortNotes } : {}) } });
      }
    }
    row.status = status;
    tradeOrderRows.push(row);
    for (const [i, l] of o.lines.entries())
      tradeOrderLineRows.push({ id: uid(), tradeOrderId: id, variantId: l.v.id, qty: l.qty, unitCents: l.unit, vatCents: lineTotals[i].vatCents, shippedQty: posted ? (l.ship ?? l.qty) : null, shipped: posted ? (posted.allocs.get(l.v.id) ?? []) : undefined });
    return { id, number, row, status, total: totals.totalCents, posted };
  }

  // Click & collect needs a shelf with whole cases on it: vendor stores (the sale's VAT must match the order's) of
  // flagship or standard format, the account's own province first.
  const collectStores = active.filter((s) => s.vendor && s.format !== "EXPRESS");
  const collectStoreFor = (a: SimAccount) => {
    const near = collectStores.filter((s) => s.province === a.province);
    const pool = near.length ? near : collectStores;
    return pool.length ? weighted(pool.map((s) => [s, s.format === "FLAGSHIP" ? 3 : 1] as const)) : null;
  };
  /**
   * Whole cases of what the account may buy and the store has: two to five lines by courier, one to three to collect,
   * at or over the minimum order and, on account, within what's left of the credit limit (`budgetCents`, incl. VAT).
   */
  function tradeBasket(a: SimAccount, s: SimStore, ts: Date, fulfilment: "COURIER" | "COLLECT", opts: { budgetCents?: number; maxCases?: number } = {}): OrderLine[] {
    const pool = variants.filter((v) => v.reg !== "THC" && a.classes.includes(v.reg as RegClass) && (s.kind === "WAREHOUSE" || ranged.has(lk(s.id, v.id))));
    if (!pool.length) return [];
    const lines: OrderLine[] = [];
    const want = fulfilment === "COURIER" ? int(2, 5) : int(1, 3);
    const subtotal = () => lines.reduce((x, l) => x + l.qty * l.unit, 0);
    const room = (opts.budgetCents ?? Infinity) - 17_250; // the courier or handling fee incl. VAT, at most
    for (let attempt = 0; attempt < 14 && (lines.length < want || subtotal() < TRADE.minOrderCents); attempt++) {
      const v = weighted(pool.map((x) => [x, (x.featured ? 1.6 : 1) * (tradeBreaksOf.has(x.id) ? 1.3 : 1)] as const));
      if (lines.some((l) => l.v.id === v.id)) continue;
      const have = Math.floor(available(s.id, v.id, ts) / v.caseQty);
      const fit = Math.floor((room - subtotal() * 1.15) / (v.caseQty * tradeUnit(v, v.caseQty) * 1.15));
      const cases = Math.min(have, fit, opts.maxCases ?? 6, fulfilment === "COURIER" ? weighted([[1, 0.55], [2, 0.3], [3, 0.1], [6, 0.05]] as const) : 1);
      if (cases < 1) continue;
      const qty = cases * v.caseQty;
      lines.push({ v, qty, unit: tradeUnit(v, qty) });
    }
    return subtotal() >= TRADE.minOrderCents ? lines : [];
  }
  /** What may still go on account now (the credit decision's headroom), less what the demo keeps free for its own open orders. */
  const creditRoom = (a: SimAccount, reserve = a.reserve) => (a.terms === "ACCOUNT" ? a.creditLimitCents - a.balance - a.open - reserve : 0);
  const orderTotal = (lines: OrderLine[], fulfilment: "COURIER" | "COLLECT") => {
    const lt = lines.map((l) => tradeLine({ unitCents: l.unit, qty: l.qty }));
    return tradeTotals(lt, fulfilment === "COURIER" ? { deliveryCents: tradeDelivery(lt.reduce((x, l) => x + l.exCents, 0), TRADE) } : { handlingCents: tradeHandling(TRADE) }).totalCents;
  };
  const buyerFor = (a: SimAccount) => weighted(a.buyers.map((b) => [b, b.role === "OWNER" ? 7 : 3] as const));

  /** A business buys about twice a month on weekdays: by courier from its DC, or click & collect at a store nearby. */
  function tradeOrdersOn(a: SimAccount, k: string) {
    const day = midnight(k);
    if (statusAt(a, day) === "PENDING" || statusAt(a, day) === "CLOSED") return;
    const held = statusAt(a, day) === "ON_HOLD";
    if (weekday(k) === 0 || (weekday(k) === 6 && !chance(0.15)) || !chance(a.rate)) return;
    const placedAt = at(k, int(8 * 60 + 15, 16 * 60));
    if (placedAt > new Date(NOW.getTime() - 2 * DAY)) return; // the last two days are the demo's own orders
    const fulfilment: "COURIER" | "COLLECT" = chance(0.72) ? "COURIER" : "COLLECT";
    const store = fulfilment === "COURIER" ? a.dc : collectStoreFor(a);
    if (!store) return;
    // On account when the terms allow, the account isn't held and there's room for at least a minimum order; else EFT.
    const onAccount = a.terms === "ACCOUNT" && !held && chance(0.8) && creditRoom(a) >= TRADE.minOrderCents * 1.15 + 17_250;
    const lines = tradeBasket(a, store, placedAt, fulfilment, { budgetCents: onAccount ? Math.floor(creditRoom(a) * 0.95) : 2_500_000 });
    if (!lines.length) return;
    const payMethod = onAccount ? "ACCOUNT" : "EFT";
    const lapse = payMethod === "EFT" && ++eftOrders === 3; // one pro forma nobody paid: cancelled by the daily job
    // One line ships short (a case the DC couldn't fill): the first on-account courier order a while back with a line of two cases or more.
    if (!shortShipped && onAccount && fulfilment === "COURIER" && placedAt < daysAgo(10) && lines.length >= 2) {
      const l = lines.find((x) => x.qty >= 2 * x.v.caseQty);
      if (l) (l.ship = l.qty - l.v.caseQty), (shortShipped = true);
    }
    placeTradeOrder({
      account: a, buyer: buyerFor(a), store, fulfilment, payMethod, lines, placedAt, steps: tradeSteps(placedAt, payMethod, fulfilment, lapse),
      reference: chance(0.4) ? `${a.ref.split(" ")[0]}-PO-${int(1000, 9999)}` : null,
      notes: chance(0.12) ? pick(["Please call the shop on arrival", "Deliver before 14:00 if possible", "Leave with reception if the buyer is out"]) : null,
    });
  }

  /** Trade-sale mode at a till: an approved account, the shelf's stock at trade prices ex VAT, paid in cash or by card, or on account within its limit. */
  function tillTradeSale(s: SimStore, ts: Date, shiftId: string) {
    const pool = tradeAccounts.filter((a) => statusAt(a, ts) === "APPROVED");
    if (!pool.length) return null;
    const near = pool.filter((a) => a.province === s.province); // mostly businesses from round the corner
    const a = weighted([...near.map((x) => [x, 12] as const), ...pool.map((x) => [x, 1] as const)]);
    const options = variants.filter((v) => v.reg !== "THC" && a.classes.includes(v.reg as RegClass) && ranged.has(lk(s.id, v.id)));
    if (!options.length) return null;
    const lines: OrderLine[] = [];
    const n = weighted([[1, 0.45], [2, 0.38], [3, 0.17]] as const);
    for (let i = 0; i < n * 3 && lines.length < n; i++) {
      const v = pick(options);
      if (lines.some((l) => l.v.id === v.id)) continue;
      const qty = Math.min(int(2, 6), available(s.id, v.id, ts));
      if (qty < 1) continue;
      lines.push({ v, qty, unit: tradeUnit(v, qty) });
    }
    if (!lines.length) return null;
    const total = lines.reduce((x, l) => x + tradeLine({ unitCents: l.unit, qty: l.qty }).inclCents, 0);
    const onAccount = a.terms === "ACCOUNT" && chance(0.35) && total <= creditRoom(a);
    const staff = pick(s.staff);
    const number = `${s.code}-A${String(++s.seq).padStart(5, "0")}`;
    let tender: TradeTender;
    if (onAccount) tender = { method: "ACCOUNT" };
    else if (chance(0.62)) tender = { method: "CARD", provider: "HALO_DOT", reference: `HALO${int(10000000, 99999999)}`, cardBrand: weighted([["Visa", 0.55], ["Mastercard", 0.42], ["Amex", 0.03]] as const), cardLast4: String(int(1000, 9999)) };
    else {
      const step = pick([5000, 10000, 20000]);
      const tendered = Math.ceil(total / step) * step;
      tender = { method: "CASH", tenderedCents: tendered, changeCents: tendered - total };
    }
    const r = postTrade({ store: s, account: a, ts, lines, number, tender, collectedByHq: false, staffId: staff.id, shiftId, deviceId: s.deviceId, ageCheck: "NONE" });
    tradeTillSales++;
    if (onAccount) {
      const dueAt = addDays(ts, a.paymentDays);
      ledger(a, { kind: "INVOICE", cents: r.total, reference: number, saleId: r.saleId, dueAt, note: `Till sale ${number} at ${s.code}`, createdById: staff.id, createdAt: ts });
      planPayment(a, r.total, `${a.ref} ${number}`, dueAt, ts, null);
    }
    tradeAudit.push({ id: uid(), at: ts, actorType: "USER", actorId: staff.id, actorName: staff.name, storeId: s.id, action: "trade.sale", entity: "Sale", entityId: r.saleId, data: { account: a.number, total: r.total, onAccount: onAccount ? r.total : 0 } });
    return { cash: tender.method === "CASH" ? r.total : 0 };
  }

  // History before the window. Durban North Pharmacy (now on hold) shipped two orders from the Durban DC: the first
  // paid, the second unpaid 45 days past due (the daily job held the account a week after it fell due), and one by
  // EFT while on hold (money up front still works). Pretoria East Pharmacy bought once, paid, and was closed when the
  // business was sold.
  // Greenleaf Pharmacy (the demo buyer) has an invoice a month old, credited in part below, and Hemp & Home's order
  // from a fortnight ago shipped one line short.
  const explicitOrder = (a: SimAccount, daysBack: number, o: { payMethod?: "EFT" | "ACCOUNT"; pay?: "random" | "prompt" | "ontime" | "never"; short?: boolean } = {}) => {
    const placedAt = at(keyOf(daysBack), 9 * 60 + int(0, 60));
    applyScheduled(placedAt); // payments made before this order count towards its credit
    const payMethod = o.payMethod ?? (a.terms === "ACCOUNT" && creditRoom(a) >= TRADE.minOrderCents * 1.15 + 17_250 ? "ACCOUNT" : "EFT");
    const lines = tradeBasket(a, a.dc, placedAt, "COURIER", { budgetCents: payMethod === "ACCOUNT" ? Math.floor(creditRoom(a) * 0.9) : 2_000_000, maxCases: 3 });
    if (!lines.length) return null;
    if (o.short) {
      const l = lines.find((x) => x.qty >= 2 * x.v.caseQty) ?? lines[0];
      if (l.qty < 2 * l.v.caseQty && available(a.dc.id, l.v.id, placedAt) >= 2 * l.v.caseQty) (l.qty = 2 * l.v.caseQty), (l.unit = tradeUnit(l.v, l.qty));
      if (l.qty >= 2 * l.v.caseQty) (l.ship = l.qty - l.v.caseQty), (shortShipped = true);
    }
    return placeTradeOrder({ account: a, buyer: a.buyers[0], store: a.dc, fulfilment: "COURIER", payMethod, lines, placedAt, steps: tradeSteps(placedAt, payMethod, "COURIER"), pay: o.pay ?? "ontime" });
  };
  const overdueAccount = tradeAccounts.find((a) => a.holdReason === "overdue")!;
  const closedAccount = tradeAccounts.find((a) => a.status === "CLOSED")!;
  explicitOrder(overdueAccount, 100, { pay: "prompt" });
  explicitOrder(overdueAccount, 75, { payMethod: "ACCOUNT", pay: "never" });
  explicitOrder(closedAccount, 50, { pay: "prompt" });
  explicitOrder(tradeAccounts[0], 31, { pay: "prompt" });
  explicitOrder(overdueAccount, 20, { payMethod: "EFT" });
  explicitOrder(tradeAccounts[7], 17, { short: true, pay: "random" });

  // Replenishment, adjustments and stock takes run on the same clock as sales.
  const stockOrders: Prisma.StockOrderCreateManyInput[] = [];
  const stockOrderLines: Prisma.StockOrderLineCreateManyInput[] = [];
  const supplierInvoices: Prisma.SupplierInvoiceCreateManyInput[] = [];
  let poSeq = 0;
  function stockOrder(kind: "WHOLESALE" | "NETWORK", buyer: SimStore, seller: SimStore, lines: { v: SimVariant; qty: number; unit: number }[], day: string, status: "RECEIVED" | "SHIPPED" | "APPROVED" | "SUBMITTED") {
    if (!lines.length) return;
    const id = uid();
    const ts = at(day, 9 * 60 + 30);
    const shippedTs = new Date(ts.getTime() - 25 * 3_600_000);
    let sub = 0;
    let receivedEx = 0;
    for (const l of lines) {
      let shipped: { batchId: string; qty: number }[] | undefined;
      let received: number | undefined;
      if (status === "RECEIVED" || status === "SHIPPED") {
        const qty = Math.min(l.qty, available(seller.id, l.v.id, shippedTs));
        shipped = qty ? take(seller.id, l.v.id, qty, "TRANSFER_OUT", shippedTs, { stockOrderId: id, note: `PO-${String(poSeq + 1).padStart(6, "0")}` }).map((a) => ({ batchId: a.batchId, qty: a.qty })) : [];
        if (status === "RECEIVED") {
          const shortInTransit = chance(0.02) && qty > 2 ? 1 : 0;
          received = shipped.reduce((s, b) => s + b.qty, 0) - shortInTransit;
          let left = received;
          for (const b of shipped) {
            const q = Math.min(left, b.qty);
            if (q > 0) put(buyer.id, l.v.id, b.batchId, q, l.unit, "TRANSFER_IN", ts, { stockOrderId: id, note: `PO-${String(poSeq + 1).padStart(6, "0")}` });
            left -= q;
          }
        }
      }
      sub += l.qty * l.unit;
      receivedEx += (received ?? 0) * l.unit;
      stockOrderLines.push({ id: uid(), stockOrderId: id, variantId: l.v.id, qty: l.qty, unitCostCents: l.unit, shipped, receivedQty: received });
    }
    const vat = Math.round(sub * 0.15);
    stockOrders.push({
      id, number: `PO-${String(++poSeq).padStart(6, "0")}`, kind, status, buyerId: buyer.id, sellerId: seller.id, subtotalCents: sub, vatCents: vat, totalCents: sub + vat,
      createdAt: new Date(ts.getTime() - 50 * 3_600_000), submittedAt: new Date(ts.getTime() - 48 * 3_600_000),
      approvedAt: status !== "SUBMITTED" ? new Date(ts.getTime() - 44 * 3_600_000) : null,
      shippedAt: status === "RECEIVED" || status === "SHIPPED" ? shippedTs : null, receivedAt: status === "RECEIVED" ? ts : null,
      invoiceSentAt: status === "RECEIVED" ? ts : null, notes: kind === "NETWORK" ? "Network trade" : "Replenishment",
    });
    // A received stock order goes on the buyer's supplier invoices, settled once its month's statement is drawn up.
    if (status === "RECEIVED" && receivedEx > 0) {
      const terms = statementTerms(day);
      const settled = terms.month < TODAY.slice(0, 7);
      const vatIn = Math.round(receivedEx * 0.15);
      supplierInvoices.push({
        id: uid(), storeId: buyer.id, supplierName: seller.name, number: `PO-${String(poSeq).padStart(6, "0")}`, invoiceDate: new Date(`${day}T00:00:00Z`), dueDate: new Date(`${terms.dueDay}T00:00:00Z`),
        totalCents: receivedEx + vatIn, vatCents: vatIn, stockOrderId: id, onStatement: true, status: settled ? "PAID" : "DUE", paidAt: settled ? new Date(`${terms.settledFrom}T00:00:00+02:00`) : null,
        note: settled ? terms.settled : terms.settles, createdById: buyer.staff[0]?.id ?? "system", createdAt: ts,
      });
    }
  }
  function replenish(s: SimStore, day: string, status: "RECEIVED" | "SUBMITTED" | "APPROVED" | "SHIPPED" = "RECEIVED") {
    const ts = at(day, 8 * 60);
    const lines: { v: SimVariant; qty: number; unit: number }[] = [];
    for (const v of variants) {
      const r = ranged.get(lk(s.id, v.id));
      if (!r) continue;
      const pos = available(s.id, v.id, ts);
      const recent = (sold14.get(lk(s.id, v.id)) ?? []).filter((t) => t > ts.getTime() - 14 * DAY).length;
      const velocity = recent / 14;
      const target = Math.max(r.par, Math.ceil(velocity * 12));
      if (pos <= Math.max(r.rp, Math.ceil(velocity * 6))) lines.push({ v, qty: target - pos, unit: v.wholesale }); // weekends/paydays sell ~1.5×
    }
    stockOrder("WHOLESALE", s, dcOf(s), lines.filter((l) => l.qty > 0), day, status);
  }

  const adjustments: { storeId: string; v: SimVariant; qty: number; reason: "DAMAGED" | "SAMPLE" | "THEFT" | "EXPIRED"; ts: Date }[] = [];
  const stockTakes: Prisma.StockTakeCreateManyInput[] = [];
  const stockTakeLines: Prisma.StockTakeLineCreateManyInput[] = [];
  let stSeq = 0;
  function stockTake(s: SimStore, day: string, approve: boolean) {
    const id = uid();
    const ts = at(day, 7 * 60 + 30);
    const flower = variants.filter((v) => v.cat === "flower" && ranged.has(lk(s.id, v.id)));
    let n = 0;
    for (const v of flower)
      for (const l of lots.get(lk(s.id, v.id)) ?? []) {
        if (l.onHand <= 0) continue;
        const counted = approve ? (chance(0.14) ? Math.max(0, l.onHand + weighted([[-1, 0.6], [-2, 0.15], [1, 0.25]] as const)) : l.onHand) : chance(0.6) ? l.onHand : null;
        const variance = approve && counted != null ? counted - l.onHand : null;
        stockTakeLines.push({ id: uid(), stockTakeId: id, variantId: v.id, batchId: l.batchId, expectedQty: l.onHand, countedQty: counted, varianceQty: variance, unitCostCents: l.unitCost });
        if (variance) {
          movements.push({ id: uid(), storeId: s.id, variantId: v.id, batchId: l.batchId, qty: variance, type: "COUNT", reason: variance > 0 ? "FOUND" : "LOST", unitCostCents: l.unitCost, stockTakeId: id, createdAt: new Date(ts.getTime() + 3_600_000), note: `Stock take ST-${String(stSeq + 1).padStart(5, "0")}`, userId: s.staff[0].id });
          l.onHand += variance;
        }
        n++;
      }
    if (!n) return;
    stockTakes.push({ id, number: `ST-${String(++stSeq).padStart(5, "0")}`, storeId: s.id, scope: "flower", blind: true, status: approve ? "APPROVED" : "COUNTING", createdById: s.staff[0].id, approvedById: approve ? s.staff[0].id : null, createdAt: ts, approvedAt: approve ? new Date(ts.getTime() + 3_600_000) : null, notes: approve ? "Monthly flower cycle count" : "In progress" });
  }

  const hourW: [number, number][] = [[9, 0.5], [10, 0.7], [11, 0.9], [12, 1.25], [13, 1.3], [14, 1], [15, 0.9], [16, 1.1], [17, 1.45], [18, 1.5], [19, 1.15]];
  const dayFactor = (k: string, i: number) => {
    const w = [0.72, 0.8, 0.85, 0.92, 1, 1.35, 1.3][weekday(k)];
    const dom = Number(k.slice(8));
    const payday = dom >= 25 || dom <= 1 ? 1.18 : 1;
    const heritage = k.endsWith("-09-24") ? 1.35 : 1;
    return w * payday * heritage * (0.9 + (0.22 * i) / DAYS);
  };
  const replDay = new Map(active.map((s, i) => [s.id, 1 + (i % 6)]));
  const phoneOrderRate = active.length * 4;
  const orderCodes = new Set<string>();

  console.log("  simulating trading…");
  for (const [di, k] of dayKeys.entries()) {
    const isToday = k === TODAY;
    const f = dayFactor(k, di);
    applyScheduled(midnight(k)); // trade payments that fell before today
    for (const s of active) {
      // Stock check every other day, received before opening. Weekly deliveries left a quarter of the network's shelves
      // empty by the payday/weekend rush at month end (and a sold-out line stops selling, so its measured velocity shrinks).
      if ((di + replDay.get(s.id)!) % 2 === 0 && !isToday) replenish(s, k);
      if (di === DAYS - 14) stockTake(s, k, true);

      const open = weekday(k) === 0 ? [10 * 60, 16 * 60] : [9 * 60, 20 * 60];
      const shiftId = uid();
      const manager = s.staff[0];
      let cashIn = 0;
      const shiftStart = at(k, open[0] - 15);
      if (isToday && nowMinutes < open[0] - 15) continue;
      const visits: { ts: Date; c: SimCustomer | null }[] = [];
      for (const c of byHome.get(s.id) ?? []) {
        if (!c.p || c.createdAt > at(k, 23 * 60)) continue;
        if (chance(c.p * f * (c.atRisk ? 0.3 : 1))) visits.push({ ts: at(k, 0), c });
      }
      const walk = Math.round(s.walkIns * f * rand(0.8, 1.2));
      for (let i = 0; i < walk; i++) visits.push({ ts: at(k, 0), c: null });
      for (const v of visits) {
        const h = weighted(hourW.filter(([hh]) => hh * 60 >= open[0] && hh * 60 < open[1]));
        v.ts = at(k, h * 60 + int(0, 59));
      }
      visits.sort((a, b) => a.ts.getTime() - b.ts.getTime());
      for (const v of visits) {
        if (isToday && v.ts > NOW) break;
        // Trade-sale mode about once in 150 sales: a business buying at trade prices, ex VAT, in cash, by card or on account.
        if (s.vendor && chance(1 / 150)) {
          const r = tillTradeSale(s, v.ts, shiftId);
          if (r) {
            cashIn += r.cash;
            continue;
          }
        }
        const c = v.c && v.c.createdAt <= v.ts ? v.c : null;
        const lines = buildBasket(s.id, c, v.ts, "POS");
        if (!lines.length) continue;
        const thc = lines.some((l) => l.v.reg === "THC");
        const staff = thc ? pick(s.staff.filter((x) => x.canDispense)) : pick(s.staff);
        const useWinback = c && v.ts > winbackSend && v.ts < daysAgo(-10) && c.atRisk && chance(0.4) ? "WELCOMEBACK" : null;
        const r = post({ store: s, c, ts: v.ts, lines, channel: "POS", number: `${s.code}-A${String(++s.seq).padStart(5, "0")}`, staffId: staff.id, shiftId, code: useWinback, tenders: "AUTO" });
        const cash = r.payRows.filter((p) => p.method === "CASH").reduce((a, p) => a + p.amountCents, 0);
        cashIn += cash;
        // Occasional refund the next day (restocked).
        if (chance(0.006) && !isToday) {
          const orig = sales[sales.length - 1];
          const line = saleLines.findLast((l) => l.saleId === orig.id);
          const rts = new Date(v.ts.getTime() + DAY);
          if (line && rts < NOW) {
            const refundId = uid();
            const amount = line.totalCents;
            const vat = line.vatCents;
            const back = line.memberSavingsCents ?? 0;
            for (const a of line.allocations as { batchId: string; qty: number; unitCostCents: number }[]) put(s.id, line.variantId, a.batchId, a.qty, a.unitCostCents, "REFUND", rts, { saleId: refundId });
            sales.push({ id: refundId, number: `${s.code}-A${String(++s.seq).padStart(5, "0")}`, kind: "REFUND", refundOfId: orig.id, storeId: s.id, channel: "POS", staffId: manager.id, customerId: orig.customerId, subtotalCents: -amount, totalCents: -amount, vatCents: -vat, costCents: -line.costCents, memberSavingsCents: -back, note: pick(["Faulty grinder thread", "Wrong size", "Changed mind (unopened)", "Damaged packaging"]), createdAt: rts, syncedAt: rts, invoiceEmail: orig.invoiceEmail });
            saleLines.push({ id: uid(), saleId: refundId, variantId: line.variantId, qty: -line.qty, unitPriceCents: line.unitPriceCents, memberSavingsCents: -back, totalCents: -amount, vatCents: -vat, costCents: -line.costCents, allocations: (line.allocations as object[]).map((a) => ({ ...a, lineId: line.id })) });
            payments.push({ id: uid(), saleId: refundId, method: "CARD", amountCents: -amount, createdAt: rts });
            bump(s.id, dayKey(rts), "POS", { refunds: 1, units: -line.qty, grossCents: -amount, vatCents: -vat, costCents: -line.costCents, memberSavingsCents: -back, cardCents: -amount });
            const vs = variantStats.get(`${s.id}|${dayKey(rts)}|${line.variantId}`) ?? { storeId: s.id, date: dayKey(rts), variantId: line.variantId, units: 0, netCents: 0, costCents: 0 };
            vs.units -= line.qty;
            vs.netCents -= amount - vat;
            vs.costCents -= line.costCents;
            variantStats.set(`${s.id}|${dayKey(rts)}|${line.variantId}`, vs);
          }
        }
      }
      const closed = !isToday;
      const expected = 100_000 + cashIn;
      const variance = closed ? weighted([[0, 0.8], [int(-5000, 2000), 0.15], [-int(10000, 30000), 0.05]] as const) : 0;
      shifts.push({ id: shiftId, storeId: s.id, deviceId: s.deviceId, openedById: manager.id, openedAt: shiftStart, openingFloatCents: 100_000, closedById: closed ? manager.id : null, closedAt: closed ? at(k, open[1] + 10) : null, expectedCashCents: closed ? expected : null, countedCashCents: closed ? expected + variance : null, notes: variance < -5000 ? "Short, investigating" : null });

      // Weekly adjustments.
      if (chance(0.16)) {
        const v = pick(variants.filter((x) => ["accessories", "wellness", "apparel", "pre-rolls"].includes(x.cat) && ranged.has(lk(s.id, x.id))));
        const reason = weighted([["DAMAGED", 0.55], ["SAMPLE", 0.3], ["THEFT", 0.15]] as const);
        if (available(s.id, v.id, at(k, 18 * 60)) > 1) adjustments.push({ storeId: s.id, v, qty: 1, reason, ts: at(k, open[1] - 30) });
      }
    }
    // Apply adjustments for the day.
    for (const a of adjustments.splice(0)) {
      const al = take(a.storeId, a.v.id, a.qty, "ADJUST", a.ts, { reason: a.reason, note: { DAMAGED: "Damaged on shelf", SAMPLE: "Demo unit", THEFT: "Shoplifting, incident logged", EXPIRED: "Expired" }[a.reason], userId: byStoreId.get(a.storeId)!.staff[0].id });
      void al;
    }
    // Expired lots are written off at their expiry.
    for (const s of active)
      for (const v of variants) {
        for (const l of lots.get(lk(s.id, v.id)) ?? []) {
          const b = bById.get(l.batchId)!;
          if (l.onHand > 0 && b.expiresAt && dayKey(b.expiresAt) === k) {
            movements.push({ id: uid(), storeId: s.id, variantId: v.id, batchId: l.batchId, qty: -l.onHand, type: "ADJUST", reason: "EXPIRED", unitCostCents: l.unitCost, createdAt: b.expiresAt, note: "Expired and destroyed", userId: s.staff[0].id });
            l.onHand = 0;
          }
        }
      }

    // Online orders (routed: collect → chosen store, same-day → nearby store, courier → DC).
    const n = Math.round(phoneOrderRate * f * rand(0.8, 1.2));
    for (let i = 0; i < n; i++) {
      const c = pick(customers);
      if (!c.email || c.createdAt > at(k, 20 * 60)) continue;
      const home = byStoreId.get(c.homeStoreId)!;
      let fulfil = weighted([["COLLECT", 0.55], ["SAME_DAY", 0.25], ["COURIER", 0.2]] as const);
      if (fulfil === "SAME_DAY" && !home.sameDay) fulfil = "COLLECT";
      const store = fulfil === "COURIER" ? dcOf(home) : home;
      const ts = at(k, int(7 * 60, 21 * 60));
      if (ts > NOW) continue;
      const lines = buildBasket(store.id, c, ts, fulfil);
      if (!lines.length) continue;
      const orderId = uid();
      let code: string;
      do code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[int(0, 31)]).join("");
      while (orderCodes.has(code));
      orderCodes.add(code);
      const payOnline = fulfil !== "COLLECT" || chance(0.62);
      const sub = lines.reduce((a, l) => a + l.qty * memberUnit(l.v.price, l.v, c, ts), 0);
      const fee = fulfil === "COLLECT" || sub >= 90000 ? 0 : fulfil === "SAME_DAY" ? (c.tier === "BLOOM" || c.tier === "HARVEST" ? 0 : 6500) : 9900;
      const steps = fulfil === "COLLECT" ? [["PICKING", int(5, 25)], ["READY", int(15, 45)], ["COMPLETED", int(60, 26 * 60)]] : [["PICKING", int(5, 25)], ["READY", int(15, 40)], ["OUT_FOR_DELIVERY", int(20, fulfil === "SAME_DAY" ? 90 : 20 * 60)], ["COMPLETED", fulfil === "SAME_DAY" ? int(40, 120) : int(24 * 60, 60 * 60)]];
      const events: { status: string; at: string; note?: string }[] = [{ status: "PLACED", at: ts.toISOString(), note: fulfil === "COURIER" ? `Ships from ${store.name}` : fulfil === "SAME_DAY" ? `Nearest same-day store with full stock (${store.name})` : "Customer's chosen store" }];
      let cursor = ts.getTime();
      let status = "PLACED";
      let postedAt: Date | null = null;
      const cancelled = chance(0.02);
      for (const [st, mins] of steps as [string, number][]) {
        cursor += mins * 60_000;
        if (cursor > NOW.getTime()) break;
        if (cancelled && st === "READY") {
          events.push({ status: "CANCELLED", at: new Date(cursor).toISOString(), note: "Customer cancelled" });
          status = "CANCELLED";
          break;
        }
        events.push({ status: st, at: new Date(cursor).toISOString() });
        status = st;
        if ((fulfil === "COLLECT" && st === "COMPLETED") || st === "OUT_FOR_DELIVERY") postedAt = new Date(cursor);
      }
      if (isToday && chance(0.03) && payOnline) status = "PENDING_PAYMENT";
      const pts = c.points >= 100 && chance(0.1) ? Math.min(c.points, Math.floor((sub * 0.3) / 100)) : 0;
      if (pts) {
        c.points -= pts;
        loyalty.push({ id: uid(), customerId: c.id, points: -pts, kind: "REDEEM", orderId, createdAt: ts });
        if (status === "CANCELLED") {
          c.points += pts;
          loyalty.push({ id: uid(), customerId: c.id, points: pts, kind: "REVERSAL", orderId, createdAt: ts, note: `Order ${code} cancelled` });
        }
      }
      let total = sub + fee;
      let vat = store.vendor ? vatOf(total) : 0;
      let discount = 0;
      if (postedAt && status !== "CANCELLED" && status !== "PENDING_PAYMENT") {
        const due = total - pts * 100;
        const tenders: Tender[] = [
          ...(pts ? [{ method: "LOYALTY" as const, amountCents: pts * 100 }] : []),
          ...(due > 0 ? [payOnline ? { method: "ONLINE" as const, amountCents: due, provider: "GATEWAY", reference: `PF${int(1000000, 9999999)}` } : { method: "CARD" as const, amountCents: due, provider: "HALO_DOT", reference: `HALO${int(10000000, 99999999)}`, cardBrand: "Visa", cardLast4: String(int(1000, 9999)) }] : []),
        ];
        const r = post({ store, c, ts: postedAt, lines, channel: "ONLINE", orderId, number: `${store.code}-W${code}`, staffId: store.staff[0]?.id ?? null, extraCents: fee, tenders });
        // Promotions may have changed the price, so keep the order in step with the posted sale.
        const sale = sales[sales.length - 1];
        const due2 = sale.totalCents - pts * 100;
        const onlinePay = r.payRows.filter((p) => p.method !== "LOYALTY");
        if (onlinePay[0]) onlinePay[0].amountCents = due2;
        const stat = storeStats.get(`${store.id}|${dayKey(postedAt)}|ONLINE`)!;
        const col = payOnline ? "onlineCents" : "cardCents";
        stat.s[col] = (stat.s[col] ?? 0) + due2 - due;
        total = sale.totalCents;
        vat = sale.vatCents;
        discount = sale.discountCents ?? 0;
      }
      orders.push({
        id: orderId, code, collectionCode: String(int(100000, 999999)), customerId: c.id, storeId: store.id, status: status as Prisma.OrderCreateManyInput["status"], fulfilment: fulfil,
        routingNote: events[0].note, ...(fulfil !== "COLLECT" && { addressLine: `${int(1, 250)} ${pick(["Oak", "Jacaranda", "Protea", "Main", "Church", "Beach"])} ${pick(["Street", "Avenue", "Road"])}`, suburb: home.name, city: home.city, province: home.province as Prisma.OrderCreateManyInput["province"], postalCode: String(int(1000, 9999)) }),
        subtotalCents: sub, discountCents: discount, deliveryCents: fee, pointsRedeemed: pts, totalCents: total, vatCents: vat,
        payMethod: payOnline ? "ONLINE" : "CARD", paymentStatus: status === "CANCELLED" ? (payOnline ? "REFUNDED" : "UNPAID") : postedAt || payOnline ? (status === "PENDING_PAYMENT" ? "UNPAID" : "PAID") : "UNPAID",
        paymentRef: payOnline ? `PF${int(1000000, 9999999)}` : null, idChecked: status === "COMPLETED",
        courier: fulfil === "COURIER" && postedAt ? "The Courier Guy" : fulfil === "SAME_DAY" && postedAt ? "Herbal Holland driver" : null,
        trackingNo: postedAt && fulfil !== "COLLECT" ? `TCG${int(10000000, 99999999)}` : null, events, createdAt: ts, updatedAt: new Date(cursor > NOW.getTime() ? NOW : cursor),
        completedAt: status === "COMPLETED" ? new Date(Math.min(cursor, NOW.getTime())) : null,
      });
      for (const l of lines) {
        const unit = memberUnit(l.v.price, l.v, c, ts);
        orderLines.push({ id: uid(), orderId, variantId: l.v.id, qty: l.qty, unitPriceCents: unit, memberSavingsCents: (l.v.price - unit) * l.qty, totalCents: l.qty * unit });
      }
    }

    // Trade orders: each approved business about twice a month, by courier from its DC or click & collect at a store.
    for (const a of tradeAccounts) tradeOrdersOn(a, k);

    // Win-back audience is defined at send time.
    if (k === keyOf(20)) for (const c of customers) if (c.last && c.visits >= 3 && c.last < daysAgo(60) && c.last > daysAgo(120)) c.atRisk = true;
  }

  // The demo's open trade orders, whatever time the seed runs: pro formas waiting for an EFT, on-account orders
  // waiting to be picked and in picking at the DC, and click & collect orders in Hatfield's queue and ready at
  // Hatfield (the demo buyer's, for the handover), Rosebank and Sea Point.
  const acc = (name: string) => tradeAccounts.find((a) => a.name === name)!;
  const storeByCode = (code: string) => collectStores.find((s) => s.code === code) ?? collectStoreFor(acc("Greenleaf Pharmacy"))!;
  const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
  const demoTrade: { a: SimAccount; fulfilment: "COURIER" | "COLLECT"; payMethod: "EFT" | "ACCOUNT"; store?: SimStore; placedAt: Date; steps: Steps; reference?: string }[] = [
    { a: acc("The Kind Café"), fulfilment: "COURIER", payMethod: "EFT", placedAt: ago(3), steps: {} },
    { a: acc("Umhlanga Health Pharmacy"), fulfilment: "COURIER", payMethod: "EFT", placedAt: ago(26), steps: {}, reference: "UHP-2026-0918" },
    { a: acc("Greenleaf Pharmacy"), fulfilment: "COURIER", payMethod: "ACCOUNT", placedAt: ago(21), steps: {} },
    { a: acc("Hemp & Home Online"), fulfilment: "COURIER", payMethod: "ACCOUNT", placedAt: ago(28), steps: { pickAt: ago(2.5) }, reference: "HH-PO-4471" },
    { a: acc("Greenleaf Pharmacy"), fulfilment: "COLLECT", payMethod: "ACCOUNT", store: storeByCode("PTA01"), placedAt: ago(27), steps: { pickAt: ago(24), readyAt: ago(22.5) } },
    { a: acc("Hemp & Home Online"), fulfilment: "COLLECT", payMethod: "ACCOUNT", store: storeByCode("JHB01"), placedAt: ago(0.8), steps: {} },
    { a: acc("Bo-Kaap Apothecary"), fulfilment: "COLLECT", payMethod: "ACCOUNT", store: storeByCode("CPT01"), placedAt: ago(25), steps: { pickAt: ago(3), readyAt: ago(2.2) } },
  ];
  for (const d of demoTrade) {
    const store = d.store ?? d.a.dc;
    const budgetCents = d.payMethod === "ACCOUNT" ? Math.min(800_000, Math.floor(creditRoom(d.a, 0) * 0.9)) : 800_000; // modest orders: the account's reserve covers both of its demo orders
    let lines: OrderLine[] = [];
    for (let k = 0; k < 6 && !lines.length; k++) lines = tradeBasket(d.a, store, d.placedAt, d.fulfilment, { budgetCents, maxCases: 2 });
    if (!lines.length) {
      console.warn(`  (trade) couldn't build the demo ${d.fulfilment.toLowerCase()} order for ${d.a.name} at ${store.name}`);
      continue;
    }
    const payMethod = d.payMethod === "ACCOUNT" && orderTotal(lines, d.fulfilment) > creditRoom(d.a, 0) ? "EFT" : d.payMethod;
    placeTradeOrder({ account: d.a, buyer: d.a.buyers[0], store, fulfilment: d.fulfilment, payMethod, lines, placedAt: d.placedAt, steps: d.steps, reference: d.reference ?? null });
  }

  // Tax invoices are numbered in the order they were raised (the sale's number, the order's invoice number, the
  // ledger reference, and the bank reference the buyer put on the payment).
  invoiced.sort((x, y) => x.postedAt.getTime() - y.postedAt.getTime());
  let tradeInvoiceSeq = 0;
  for (const inv of invoiced) {
    const ti = tradeInvoiceNumber(++tradeInvoiceSeq);
    inv.sale.number = ti;
    inv.order.invoiceNumber = ti;
    inv.entry.reference = ti;
    if (inv.payment) inv.payment.row.reference = `${inv.account.ref} ${ti}`;
  }

  // One credit note by hand (TC-000001): two units on Greenleaf's oldest invoice arrived with broken seals; the trade
  // team credited them (destroyed, not returned to stock) and the pharmacy paid that invoice net of the credit.
  const greenleaf = acc("Greenleaf Pharmacy");
  const credited = invoiced.find((x) => x.account === greenleaf && x.order.payMethod === "ACCOUNT" && x.postedAt < daysAgo(5)) ?? invoiced.find((x) => x.order.payMethod === "ACCOUNT" && x.postedAt < daysAgo(5));
  let tradeCreditSeq = 0;
  if (credited) {
    const line = saleLines.find((l) => l.saleId === credited.sale.id)!;
    const v = vById.get(line.variantId)!;
    const units = Math.min(2, line.qty);
    const cents = tradeLine({ unitCents: line.unitPriceCents, qty: units }).inclCents;
    const tc = tradeCreditNumber(++tradeCreditSeq);
    const when = new Date(credited.postedAt.getTime() + DAY + 5 * 3_600_000);
    const who = credited.account;
    ledger(who, { kind: "CREDIT_NOTE", cents: -cents, reference: tc, saleId: credited.sale.id, tradeOrderId: credited.orderId, note: `Returned: ${units} × ${lineName(v)} from ${credited.sale.number}, seals broken in transit. Credited, not restocked`, createdById: johanId, createdAt: when });
    tradeAudit.push({ id: uid(), at: when, ...hqActor(hqJohan), action: "trade.credit_note", entity: "TradeAccount", entityId: who.id, data: { number: who.number, cents, reference: tc, note: `Returned ${units} × ${lineName(v)} from ${credited.sale.number}` } });
    if (credited.payment) {
      credited.payment.row.cents += cents;
      if (credited.payment.applied) who.balance += cents;
    }
  }
  applyScheduled(NOW);

  // Last month's statements went out on the statement day (the daily job keeps one receipt per account and month in
  // the message log, so it never sends one twice).
  const tradeMessages: Prisma.MessageLogCreateManyInput[] = [];
  const stmtMonth = previousMonth(NOW);
  const stmtAt = at(`${dayKey(NOW).slice(0, 7)}-${String(TRADE.statementDay).padStart(2, "0")}`, 2 * 60 + 5);
  if (stmtAt <= NOW) {
    const { tradeStatementEmail, tradePortalUrl } = await import("../src/server/trade/emails");
    const period = statementMonth(stmtMonth);
    for (const a of tradeAccounts) {
      if (a.status !== "APPROVED" && a.status !== "ON_HOLD") continue;
      const entries = ledgerRows.filter((e) => e.tradeAccountId === a.id && (e.createdAt as Date) < stmtAt).map((e) => ({ kind: e.kind, cents: e.cents, createdAt: e.createdAt as Date, dueAt: e.dueAt as Date | null, reference: e.reference, note: e.note, tradeOrderId: e.tradeOrderId, saleId: e.saleId }));
      if (!entries.length) continue;
      const st = tradeStatement(entries, period);
      const r = tradeStatementEmail({ account: { number: a.number, name: a.name, legalName: a.legalName, email: a.email, kind: a.kind, terms: a.terms, creditLimitCents: a.creditLimitCents, paymentDays: a.paymentDays, classes: a.classes, holdReason: a.holdReason }, month: stmtMonth, opening: st.opening, lines: st.lines, closing: st.closing, ageing: st.ageing, url: tradePortalUrl(`/statements/${stmtMonth}`) });
      tradeMessages.push({ id: `trade-statement-${a.id}-${stmtMonth}`, channel: "EMAIL", to: a.email, kind: "trade-statement", status: "SENT", reason: "logged (SMTP_URL not set)", body: `${r.subject}\n\n${r.text}`, createdAt: stmtAt });
      tradeAudit.push({ id: uid(), at: stmtAt, actorType: "SYSTEM", actorName: "Trade statements", action: "trade.statement", entity: "TradeAccount", entityId: a.id, data: { month: stmtMonth, closing: st.closing } });
    }
  }
  const tradeBuyerRows: Prisma.TradeBuyerCreateManyInput[] = [];
  for (const a of tradeAccounts)
    for (const b of a.buyers) {
      const last = tradeOrderRows.filter((o) => o.buyerId === b.id).map((o) => o.createdAt as Date).sort((x, y) => y.getTime() - x.getTime())[0];
      tradeBuyerRows.push({ id: b.id, tradeAccountId: a.id, name: b.name, email: b.email, phone: b.phone, role: b.role, active: true, lastSignInAt: last ?? (a.approvedAt ? new Date(a.approvedAt.getTime() + int(1, 48) * 3_600_000) : null), createdAt: b.role === "OWNER" ? a.applied : new Date(a.applied.getTime() + int(3, 20) * DAY) });
    }

  // The demo store always has click & collect orders waiting (whatever time the seed runs) for the dashboard queue,
  // the POS handover demo and the end-to-end tests.
  const demo = stores.find((x) => x.code === "PTA01");
  // Regulars with an email and no patient authorisation: PTA01's own first, then anyone (short seeds may have none).
  const pool = customers.filter((c) => c.email && !c.auth && c.createdAt < daysAgo(2));
  const regulars = demo ? [...pool.filter((c) => c.homeStoreId === demo.id), ...pool.filter((c) => c.homeStoreId !== demo.id)] : [];
  for (const [i, status] of (["READY", "PLACED"] as const).entries()) {
    if (!demo) break;
    const ts = new Date(NOW.getTime() - (95 - i * 50) * 60_000);
    // A basket can come up empty when the draw lands on items the store has sold out of: try other regulars. Prefer
    // one with 18+ items, so the handover demo (and the end-to-end test) shows the ID check.
    const adult = (ls: ReturnType<typeof buildBasket>) => ls.some((l) => l.v.reg !== "APPAREL");
    let c: SimCustomer | undefined;
    let lines: ReturnType<typeof buildBasket> = [];
    for (let k = 0; k < 80 && !adult(lines); k++) {
      const who = regulars[(i * 7 + k * 3) % Math.max(1, regulars.length)];
      const got = who ? buildBasket(demo.id, who, ts, "COLLECT") : [];
      if (got.length && (!lines.length || adult(got))) (c = who), (lines = got);
    }
    if (!c || !lines.length) throw new Error(`Seed: couldn't build the demo ${status} click & collect order at PTA01`);
    let code: string;
    do code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[int(0, 31)]).join("");
    while (orderCodes.has(code));
    orderCodes.add(code);
    const orderId = uid();
    const units = lines.map((l) => ({ l, unit: memberUnit(l.v.price, l.v, c, ts) }));
    const sub = units.reduce((a, x) => a + x.l.qty * x.unit, 0);
    const events = [{ status: "PLACED", at: ts.toISOString(), note: "Customer's chosen store" }];
    if (status === "READY") events.push({ status: "PICKING", at: new Date(ts.getTime() + 8 * 60_000).toISOString(), note: "" }, { status: "READY", at: new Date(ts.getTime() + 25 * 60_000).toISOString(), note: "" });
    orders.push({
      id: orderId, code, collectionCode: String(int(100000, 999999)), customerId: c.id, storeId: demo.id, status, fulfilment: "COLLECT",
      routingNote: events[0].note, subtotalCents: sub, discountCents: 0, deliveryCents: 0, pointsRedeemed: 0, totalCents: sub,
      vatCents: demo.vendor ? vatOf(sub) : 0, payMethod: "CARD", paymentStatus: "UNPAID", events, createdAt: ts, updatedAt: ts,
    });
    for (const { l, unit } of units)
      orderLines.push({ id: uid(), orderId, variantId: l.v.id, qty: l.qty, unitPriceCents: unit, memberSavingsCents: (l.v.price - unit) * l.qty, totalCents: l.qty * unit });
  }

  // A network trade or two per region (store-to-store), then open purchasing work.
  const byRegion = new Map<string, SimStore[]>();
  for (const s of active) byRegion.set(s.regionCode, [...(byRegion.get(s.regionCode) ?? []), s]);
  const tradeDay = keyOf(6);
  for (const [, list] of byRegion) {
    if (list.length < 2) continue;
    const [seller, buyer] = [list[0], list[1]];
    const v = variants.find((x) => x.slug === "windmill-haze" && x.label === "3.5g")!;
    if (available(seller.id, v.id, at(tradeDay, 8 * 60)) > 8) stockOrder("NETWORK", buyer, seller, [{ v, qty: 4, unit: Math.round(v.wholesale * 1.05) }], tradeDay, "RECEIVED");
  }
  for (const [i, s] of active.entries()) if (i % 4 === 0) replenish(s, TODAY, (["SUBMITTED", "APPROVED", "SHIPPED"] as const)[i % 3]);
  stockTake(active[0], TODAY, false);

  // ── Derived & reference data ────────────────────────────────────────────
  const customerRows: Prisma.CustomerCreateManyInput[] = customers.map((c) => ({
    id: c.id, memberNo: c.memberNo, phone: c.phone, email: c.email, firstName: c.firstName, lastName: c.lastName, dob: c.dob,
    ageVerifiedAt: c.createdAt, ageCheck: c.ageCheck, idLast4: String(int(1000, 9999)), tier: tierFor(c.prior12m + c.spend.filter((x) => x.ts > NOW.getTime() - 365 * DAY).reduce((a, x) => a + x.cents, 0)).key,
    homeStoreId: c.homeStoreId, referralCode: c.referralCode, referredById: c.referredById,
    consentSms: c.consents.SMS, consentEmail: c.consents.EMAIL, consentWhatsapp: c.consents.WHATSAPP, consentPush: c.consents.PUSH, consentAt: c.createdAt,
    source: c.source, points: c.points, lifetimeCents: c.lifetime, visits: c.visits, firstPurchaseAt: c.first, lastPurchaseAt: c.last, createdAt: c.createdAt, lastSeenAt: c.last,
  }));
  const consentRows: Prisma.ConsentEventCreateManyInput[] = customers.flatMap((c) =>
    (Object.entries(c.consents) as [Prisma.ConsentEventCreateManyInput["channel"], boolean][]).filter(([, g]) => g).map(([channel]) => ({ id: uid(), customerId: c.id, channel, granted: true, source: c.source === "POS" ? "POS" : "SIGNUP_WEB", wording: "I'd like to hear from Herbal Holland about drops, offers and events on the channels I've ticked.", createdAt: c.createdAt })),
  );
  const birthdays = customers.filter((c) => c.dob.getUTCMonth() === NOW.getUTCMonth() && c.visits > 0).slice(0, 400);
  for (const c of birthdays) {
    loyalty.push({ id: uid(), customerId: c.id, points: 100, kind: "BIRTHDAY", createdAt: at(`${dayKey(NOW).slice(0, 7)}-01`, 8 * 60), note: "Happy birthday from Herbal Holland" });
    customerRows.find((r) => r.id === c.id)!.points = c.points + 100;
  }

  const expenseRows: Prisma.ExpenseCreateManyInput[] = [];
  const months = [...new Set(dayKeys.map((k) => k.slice(0, 7)))];
  for (const s of active)
    for (const m of months) {
      const fmt = s.format;
      const add = (day: string, category: Prisma.ExpenseCreateManyInput["category"], description: string, amount: number, vatable = true, supplier?: string) => {
        const date = midnight(`${m}-${day}`);
        if (date > NOW || date < daysAgo(DAYS)) return;
        expenseRows.push({ id: uid(), storeId: s.id, date, category, description, supplier, amountCents: amount, vatCents: vatable ? vatOf(amount) : 0, createdById: s.staff[0].id });
      };
      add("01", "RENT", "Monthly rent", { FLAGSHIP: 8_500_000, STANDARD: 4_500_000, EXPRESS: 2_200_000 }[fmt], true, "Landlord");
      add("25", "SALARIES", "Staff salaries", { FLAGSHIP: 14_000_000, STANDARD: 9_000_000, EXPRESS: 4_500_000 }[fmt], false);
      add("05", "UTILITIES", "Electricity & water", int(800_000, 1_400_000), true, "Municipality");
      add("03", "SECURITY", "Armed response & CCTV", int(450_000, 750_000), true, pick(["ADT", "Fidelity", "Bidvest Protea Coin"]));
      add("28", "BANK_FEES", "Card acquiring & bank charges", int(300_000, 900_000), true, "Bank");
      add("12", "SUPPLIES", "Bags, labels, till rolls", int(150_000, 400_000), true);
      add("15", "MARKETING", "Local events & signage", int(200_000, 800_000), true);
    }

  // Campaigns & message log.
  const hqUser = users[0].id as string;
  void hqUser;
  const campaigns: Prisma.CampaignCreateManyInput[] = [];
  const messageRows: Prisma.MessageLogCreateManyInput[] = [];
  const footer = `\n${HQ_COMPANY.legalName}, ${HQ_COMPANY.address}, ${HQ_COMPANY.phone}, ${HQ_COMPANY.email}. Reply STOP to opt out.`;
  function campaign(id: string, name: string, channel: "SMS" | "EMAIL" | "PUSH" | "WHATSAPP", segment: string, message: string, audience: SimCustomer[], sentAt: Date | null, status: "SENT" | "DRAFT" | "SCHEDULED", promotionId?: string, costCents = 0) {
    const consentKey = channel === "WHATSAPP" ? "WHATSAPP" : channel;
    const reachable = audience.filter((c) => c.consents[consentKey] && (channel !== "EMAIL" || c.email));
    campaigns.push({ id, name, channel, segment, message, promotionId, status, sentAt: status === "SENT" ? sentAt : null, scheduledAt: status === "SCHEDULED" ? sentAt : null, costCents, audienceCount: status === "SENT" ? audience.length : 0, sentCount: status === "SENT" ? reachable.length : 0, suppressedCount: status === "SENT" ? audience.length - reachable.length : 0, createdAt: new Date((sentAt ?? NOW).getTime() - 2 * DAY) });
    if (status === "SENT")
      for (const c of reachable)
        messageRows.push({ id: uid(), campaignId: id, customerId: c.id, to: channel === "EMAIL" ? c.email! : c.phone, channel, kind: "MARKETING", status: "SENT", body: message.replaceAll("{{firstName}}", c.firstName).replaceAll("{{code}}", "WELCOMEBACK") + footer, createdAt: sentAt! });
  }
  if (sep1 > daysAgo(DAYS)) campaign(heritageCampaignId, "Heritage Month launch", "SMS", "ALL", "Hi {{firstName}}, happy Heritage Month from Herbal Holland! 15% off apparel & accessories all September, in store and online.", customers.filter((c) => c.createdAt < sep1), at(dayKey(sep1), 9 * 60 + 30), "SENT", heritagePromoId, 1_850_000);
  campaign(winbackCampaignId, "We miss you: R75 off", "SMS", "AT_RISK", "Hi {{firstName}}, it's been a while! Here's R75 off when you spend R400 on coffee, skin care, accessories or apparel. Use code {{code}} by the end of the month.", customers.filter((c) => c.atRisk), winbackSend, "SENT", winbackPromoId, 240_000);
  campaign(balmCampaignId, "New: Recover CBD Muscle Balm", "PUSH", "LOYAL", "New in skin care: Recover CBD Muscle Balm, with arnica, wintergreen and 500 mg CBD for after the gym.", customers.filter((c) => c.visits >= 5 && c.last && c.last > daysAgo(60)), at(keyOf(8), 11 * 60), "SENT");
  const nextFriday = new Date(NOW.getTime() + ((5 - NOW.getUTCDay() + 7) % 7 || 7) * DAY);
  campaign(uid(), "Double Points Friday", "SMS", "ALL", "Hi {{firstName}}, it's Double Points Friday at Herbal Holland: every rand counts twice today.", [], at(dayKey(nextFriday), 10 * 60), "SCHEDULED");
  campaign(uid(), "Spring grow season", "EMAIL", "PROSPECT", "Hi {{firstName}}, spring is planting season. Everything for the home grow (living soil, nutrients and heritage seeds) is in store now.", [], null, "DRAFT");

  // Reviews, stock alerts, announcements, suppressions, audit trail.
  const reviewRows: Prisma.ReviewCreateManyInput[] = [];
  const reviewed = new Set<string>();
  const REVIEW = {
    5: [["Exactly as described", "Beautiful quality and the staff knew their stuff."], ["My new favourite", "Consistent every time. Love that I can see the lab results."], ["Worth it", "Great value with my Rewards points. Collection was ready in 10 minutes."]],
    4: [["Really good", "Lovely product, would buy again."], ["Solid", "Good quality, slightly pricey but you get what you pay for."]],
    3: [["Decent", "Okay, not my favourite from the range."]],
    2: [["Not for me", "Didn't suit me, but the staff were great about it."]],
    1: [["Disappointed", "Packaging was damaged on collection."]],
  } as const;
  const saleById = new Map(sales.map((x) => [x.id, x]));
  for (const sl of saleLines.slice(0, 40000)) {
    if (reviewRows.length >= 420 || !chance(0.02)) continue;
    const sale = saleById.get(sl.saleId);
    const v = vById.get(sl.variantId);
    if (!sale?.customerId || !v || v.reg === "THC" || reviewed.has(`${v.productId}|${sale.customerId}`)) continue; // no medicine testimonials
    reviewed.add(`${v.productId}|${sale.customerId}`);
    const rating = weighted([[5, 0.56], [4, 0.29], [3, 0.1], [2, 0.04], [1, 0.01]] as const);
    const [title, body] = pick(REVIEW[rating] as readonly (readonly [string, string])[]);
    const writtenAt = new Date((sale.createdAt as Date).getTime() + int(1, 5) * DAY);
    if (writtenAt <= NOW) reviewRows.push({ id: uid(), productId: v.productId, customerId: sale.customerId, rating, title, body, verified: true, createdAt: writtenAt });
  }
  const alertRows: Prisma.StockAlertCreateManyInput[] = [];
  const reserve = variants.find((v) => v.slug === "reserve-gelato-cake")!;
  const alertSeen = new Set<string>();
  for (let i = 0; i < 180; i++) {
    const c = pick(customers);
    const v = chance(0.5) ? reserve : pick(variants);
    if (alertSeen.has(`${c.id}|${v.id}`)) continue;
    alertSeen.add(`${c.id}|${v.id}`);
    alertRows.push({ id: uid(), customerId: c.id, variantId: v.id, createdAt: daysAgo(int(0, 30)) });
  }
  const announcements: Prisma.AnnouncementCreateManyInput[] = [
    { id: uid(), title: "Recall: Rooibos & Honey Gummies batch B", body: "Quarantine all units of the batch ending -B immediately. Do not sell. Customers who bought this batch are being contacted by HQ. Log returns as RECALL adjustments.", kind: "RECALL", audience: "ALL", requiresAck: true, createdAt: daysAgo(10) },
    { id: uid(), title: "Heritage Month toolkit", body: "Window decals, shelf talkers and the Heritage Day event pack are in the shared drive. 15% off apparel & accessories runs until 30 September.", kind: "LAUNCH", audience: "ALL", requiresAck: false, createdAt: daysAgo(28) },
    { id: uid(), title: "Policy: ID checks at every handover", body: "Click & collect and delivery handovers must record an ID check (18+). The POS now blocks handover until the check is ticked.", kind: "POLICY", audience: "ALL", requiresAck: true, createdAt: daysAgo(15) },
    { id: uid(), title: "Reserve No. 1 drops Friday", body: "400 numbered jars across flagship stores. Harvest-tier members get first access from 09:00.", kind: "LAUNCH", audience: "format:FLAGSHIP", requiresAck: false, createdAt: daysAgo(2) },
  ];
  const ackRows: Prisma.AnnouncementAckCreateManyInput[] = [];
  for (const a of announcements) if (a.requiresAck) for (const s of active) if (chance(0.8)) ackRows.push({ announcementId: a.id as string, storeId: s.id, userId: s.staff[0].id, at: new Date((a.createdAt as Date).getTime() + int(1, 48) * 3_600_000) });
  const suppressionRows: Prisma.SuppressionCreateManyInput[] = customers.filter(() => chance(0.004)).map((c) => ({ id: uid(), value: c.phone, source: "NCC_REGISTRY", createdAt: daysAgo(int(1, 30)) }));

  const recalled = batches.find((b) => b.status === "RECALLED")!;
  const quarantined = batches.find((b) => b.status === "QUARANTINE")!;
  const auditRows: Prisma.AuditLogCreateManyInput[] = [
    { id: uid(), at: recalled.unsellableFrom!, actorType: "USER", actorName: "Naledi Khumalo", action: "batch.recall", entity: "Batch", entityId: recalled.id, data: { code: recalled.code, reason: recalled.reason } },
    { id: uid(), at: quarantined.unsellableFrom!, actorType: "USER", actorName: "Pieter de Vries", action: "batch.quarantine", entity: "Batch", entityId: quarantined.id, data: { code: quarantined.code, reason: quarantined.reason } },
    ...overrides.map((o) => ({ id: uid(), at: daysAgo(int(10, DAYS)), actorType: "USER", actorName: byStoreId.get(o.storeId)!.staff[0].name, storeId: o.storeId, action: "price.override", entity: "Variant", entityId: o.variantId, data: { priceCents: o.price } })),
    ...Array.from({ length: 60 }, () => {
      const s = pick(active);
      return { id: uid(), at: new Date(NOW.getTime() - rand(0, DAYS) * DAY), actorType: "USER", actorName: pick(s.staff).name, storeId: s.id, action: "compliance.block", entity: "Sale", data: { blocks: [pick(["A valid SAHPRA patient authorisation must be on file for this customer", "Age verification required (18+)", "Exceeds the authorised quantity: 4.5g left this month, 7g in cart", "An authorised dispenser must complete this sale"])] } };
    }),
    ...tradeAudit,
    ...stockTakes.filter((s) => s.status === "APPROVED").map((s) => ({ id: uid(), at: s.approvedAt as Date, actorType: "USER", actorName: "Store manager", storeId: s.storeId, action: "stocktake.approve", entity: "StockTake", entityId: s.id })),
  ];

  const deviceRows: Prisma.DeviceCreateManyInput[] = active.map((s) => ({ id: s.deviceId, storeId: s.id, name: "Counter 1 (Sunmi V2s)", prefix: "A", seq: s.seq, tokenHash: `seed-${s.deviceId}`, lastSeenAt: NOW }));

  const priceLists: Prisma.PriceListCreateManyInput[] = [];
  const priceItems: Prisma.PriceListItemCreateManyInput[] = [];
  const plZone = uid(), plMember = uid(), plVolume = uid(), plOct = uid();
  priceLists.push(
    { id: plZone, name: "Atlantic Seaboard tourist zone", kind: "ZONE", storeIds: [stores.find((s) => s.code === "CPT01")!.id], regionIds: [], adjustPct: 5, priority: 1 },
    { id: plMember, name: "Rewards deal", kind: "MEMBER", tiers: [], storeIds: [], regionIds: [], priority: 0, startsAt: dealFrom, endsAt: new Date(dealFrom.getTime() + 7 * DAY) },
    { id: plVolume, name: "Volume pricing", kind: "ZONE", storeIds: [], regionIds: [], priority: 0 },
    { id: plOct, name: "October price update", kind: "ZONE", storeIds: [], regionIds: [], priority: 2, startsAt: midnight(`${NOW.getUTCFullYear()}-${String(NOW.getUTCMonth() + 2).padStart(2, "0")}-01`) },
  );
  priceLists.push({ id: plTrade, name: "Trade 2026", kind: "TRADE", storeIds: [], regionIds: [], priority: 10, createdAt: daysAgo(DAYS + 100) });
  for (const [variantId, breaks] of tradeBreaksOf) for (const b of breaks) priceItems.push({ id: uid(), priceListId: plTrade, variantId, priceCents: b.price, minQty: b.minQty });
  const papers = variants.find((v) => v.slug === "king-size-papers")!;
  priceItems.push({ id: uid(), priceListId: plVolume, variantId: papers.id, priceCents: 3000, minQty: 10 }, { id: uid(), priceListId: plVolume, variantId: papers.id, priceCents: 2800, minQty: 24 });
  for (const [variantId, priceCents] of deals) priceItems.push({ id: uid(), priceListId: plMember, variantId, priceCents, minQty: 1 });
  for (const v of variants.filter((x) => x.cat === "grow").slice(0, 3)) priceItems.push({ id: uid(), priceListId: plOct, variantId: v.id, priceCents: v.price + 1000, minQty: 1 });

  // Stock levels are the sum of the ledger.
  const levelRows: Prisma.StockLevelCreateManyInput[] = [];
  for (const [key, arr] of lots) {
    const [storeId, variantId] = key.split("|");
    for (const l of arr) levelRows.push({ id: uid(), storeId, variantId, batchId: l.batchId, onHand: l.onHand, unitCostCents: l.unitCost });
  }

  // Rollups from the same records.
  const storeStatRows: Prisma.DailyStoreStatCreateManyInput[] = [...storeStats.values()].map((r) => ({ storeId: r.storeId, date: dateOnly(r.date), channel: r.channel, ...r.s }));
  const variantStatRows: Prisma.DailyVariantStatCreateManyInput[] = [...variantStats.values()].map((r) => ({ ...r, date: dateOnly(r.date) }));

  // ── Write ───────────────────────────────────────────────────────────────
  console.log("  writing…");
  await insert("regions", db.region, REGIONS.map((r) => ({ id: regionId[r.code], code: r.code, name: r.name })));
  await insert("companies", db.company, companies);
  await insert("stores", db.store, storeRows.filter((s) => !s.dcId));
  await insert("stores (served)", db.store, storeRows.filter((s) => s.dcId));
  await insert("users", db.user, users);
  await insert("devices", db.device, deviceRows);
  await insert("categories", db.category, CATEGORIES.map((c, i) => ({ id: catId[c.slug], slug: c.slug, name: c.name, icon: c.icon, blurb: c.blurb, sortOrder: i })));
  await insert("products", db.product, productRows);
  // Product photos, stored like an imported photo (Upload + ProductImage, served at /media/[id]): the studio render
  // (public/catalogue/products, scripts/render) first, then any artwork mock-ups (public/merch/print/accessories).
  {
    const { putObject } = await import("../src/server/storage");
    const uploads: Prisma.UploadCreateManyInput[] = [];
    const images: Prisma.ProductImageCreateManyInput[] = [];
    for (const p of PRODUCTS) {
      const files: [string, string][] = [];
      const render = new URL(`../public/catalogue/products/${p.slug}.webp`, import.meta.url);
      if (existsSync(render)) files.push([render.pathname, "image/webp"]);
      for (const key of p.images ?? []) files.push([new URL(`../public/merch/print/accessories/${key}.mockup.png`, import.meta.url).pathname, "image/png"]);
      for (const [i, [file, type]] of files.entries()) {
        const body = readFileSync(file);
        const id = uid().replaceAll("-", ""); // /media/[id] takes letters and digits only
        const ext = type === "image/png" ? "png" : "webp";
        await putObject(`products/${id}.${ext}`, new Uint8Array(body), type);
        uploads.push({ id, key: `products/${id}.${ext}`, fileName: `${p.slug}-${i + 1}.${ext}`, contentType: type, sizeBytes: body.length, sha256: createHash("sha256").update(body).digest("hex") });
        images.push({ productId: productIdBySlug[p.slug], uploadId: id, alt: p.name, sortOrder: i });
      }
    }
    await insert("product photo files", db.upload, uploads);
    await insert("product photos", db.productImage, images);
  }
  await insert("variants", db.variant, variantRows);
  await insert("batches", db.batch, batchRows);
  await insert("store ranging", db.storeVariant, svRows);
  await insert("stock levels", db.stockLevel, levelRows);
  await insert("customers", db.customer, customerRows);
  await insert("patient authorisations", db.patientAuth, authRows);
  await insert("consent events", db.consentEvent, consentRows);
  await insert("promotions", db.promotion, promoDefs);
  await insert("price lists", db.priceList, priceLists);
  await insert("price list items", db.priceListItem, priceItems);
  // ── Cash banking: each cash-up's cash goes in by the next business day and owners check deposits against the
  // statement. One store is running late (overdue alert) and one recent deposit came up short (queried).
  const { putObject } = await import("../src/server/storage");
  const slip = readFileSync(new URL("./demo/deposit-slip.jpg", import.meta.url));
  await putObject("demo/deposit-slip.jpg", new Uint8Array(slip), "image/jpeg");
  const slipSha = createHash("sha256").update(slip).digest("hex");
  const uploadRows: Prisma.UploadCreateManyInput[] = [];
  const depositRows: Prisma.CashDepositCreateManyInput[] = [];
  const hqAdmin = users.find((u) => u.role === "HQ_ADMIN")!;
  const lateStore = active[active.length - 1];
  const shortStore = active.find((x) => x.code === "JHB01") ?? active[1];
  let shortDeposit: Prisma.CashDepositCreateManyInput | null = null;
  for (const st of active) {
    const owner = users.find((u) => u.role === "OWNER" && u.companyId === companyId[st.companyKey]) ?? hqAdmin;
    const byDue = new Map<string, typeof shifts>();
    for (const x of shifts)
      if (x.storeId === st.id && x.closedAt && cashToBank({ countedCashCents: x.countedCashCents as number, openingFloatCents: x.openingFloatCents }) > 0) {
        const due = bankBy(x.closedAt as Date, 1);
        byDue.set(due, [...(byDue.get(due) ?? []), x]);
      }
    const dues = [...byDue.keys()].filter((d) => d < TODAY && !(st.id === lateStore.id && d >= keyOf(5))).sort();
    for (const due of dues) {
      const list = byDue.get(due)!;
      const id = uid();
      const slipId = uid();
      const expected = list.reduce((t, x) => t + cashToBank({ countedCashCents: x.countedCashCents as number, openingFloatCents: x.openingFloatCents }), 0);
      const bankedOn = at(due, 11 * 60);
      const short = st.id === shortStore.id && due === dues[dues.length - 2] ? 20_000 : 0;
      const checked = !short && bankedOn < daysAgo(3);
      uploadRows.push({ id: slipId, key: "demo/deposit-slip.jpg", fileName: "deposit-slip.jpg", contentType: "image/jpeg", sizeBytes: slip.length, sha256: slipSha, storeId: st.id, uploadedById: st.staff[0].id, createdAt: bankedOn });
      const d: Prisma.CashDepositCreateManyInput = {
        id, number: `DEP-${String(depositRows.length + 1).padStart(6, "0")}`, storeId: st.id, bankedOn, amountCents: expected - short, expectedCents: expected,
        reference: `${st.code}-${due.replaceAll("-", "").slice(2)}`, slipId, createdById: st.staff[0].id, createdAt: bankedOn,
        status: short ? "QUERIED" : checked ? "VERIFIED" : "RECORDED",
        reviewedById: short || checked ? owner.id : null, reviewedAt: short || checked ? new Date(Math.min(bankedOn.getTime() + 2 * DAY, NOW.getTime())) : null,
        reviewNote: short ? "R200 short against the cash-ups. The manager is to explain and bank the difference." : null,
      };
      depositRows.push(d);
      if (short) shortDeposit = d;
      for (const x of list) x.depositId = id;
    }
  }
  // Each trade licence's document: a one-page sample certificate, plainly marked as one.
  for (const l of licenceDocs) {
    const info = TRADE_LICENCES[l.kind];
    const body = samplePdf([
      [9, false, "SAMPLE DOCUMENT FOR THE HERBAL HOLLAND DEMO, NOT A LICENCE", 0.45],
      [18, true, info.name, 0],
      [11, false, `Issued by ${info.issuer}`, 0.3],
      [11, false, info.law, 0.3],
      [12, false, "", 0],
      [12, true, l.account.legalName, 0],
      [11, false, `Trading as ${l.account.name}`, 0],
      [11, false, [l.account.addressLine, l.account.suburb, l.account.city, l.account.postalCode].filter(Boolean).join(", "), 0],
      [12, false, "", 0],
      [12, false, `Number: ${l.number}`, 0],
      [12, false, l.expiresAt ? `Valid until: ${dayKey(l.expiresAt)}` : "Valid until: does not lapse", 0],
    ]);
    const key = `demo/trade-licences/${l.uploadId}.pdf`;
    await putObject(key, body, "application/pdf");
    uploadRows.push({ id: l.uploadId, key, fileName: `${l.kind.toLowerCase().replaceAll("_", "-")}.pdf`, contentType: "application/pdf", sizeBytes: body.length, sha256: createHash("sha256").update(body).digest("hex"), createdAt: l.at });
  }
  await insert("uploads", db.upload, uploadRows);
  await insert("deposits", db.cashDeposit, depositRows);
  await db.counter.create({ data: { key: "DEPOSIT", value: depositRows.length } });
  await insert("shifts", db.shift, shifts);
  await insert("orders", db.order, orders);
  await insert("order lines", db.orderLine, orderLines);
  await insert("trade accounts", db.tradeAccount, tradeAccountRows);
  await insert("trade buyers", db.tradeBuyer, tradeBuyerRows);
  await insert("trade licences", db.tradeLicence, tradeLicenceRows);
  await insert("sales", db.sale, sales.filter((s) => s.kind !== "REFUND"));
  await insert("refunds", db.sale, sales.filter((s) => s.kind === "REFUND"));
  await insert("sale lines", db.saleLine, saleLines);
  await insert("payments", db.payment, payments);
  await insert("trade orders", db.tradeOrder, tradeOrderRows);
  await insert("trade order lines", db.tradeOrderLine, tradeOrderLineRows);
  await insert("trade ledger", db.tradeLedgerEntry, ledgerRows);
  await insert("stock orders", db.stockOrder, stockOrders);
  await insert("stock order lines", db.stockOrderLine, stockOrderLines);
  await insert("supplier invoices", db.supplierInvoice, supplierInvoices);
  await insert("stock takes", db.stockTake, stockTakes);
  await insert("stock take lines", db.stockTakeLine, stockTakeLines);
  await insert("stock movements", db.stockMovement, movements);
  await insert("loyalty ledger", db.loyaltyEntry, loyalty);
  await insert("expenses", db.expense, expenseRows);
  await insert("campaigns", db.campaign, campaigns);
  await insert("messages", db.messageLog, [...messageRows, ...tradeMessages]);
  await insert("reviews", db.review, reviewRows);
  await insert("stock alerts", db.stockAlert, alertRows);
  await insert("announcements", db.announcement, announcements);
  await insert("announcement acks", db.announcementAck, ackRows);
  await insert("suppressions", db.suppression, suppressionRows);
  await insert("audit log", db.auditLog, auditRows);
  await insert("daily store stats", db.dailyStoreStat, storeStatRows);
  await insert("daily variant stats", db.dailyVariantStat, variantStatRows);
  await insert("listings", db.listing, active.slice(0, 10).map((s, i) => {
    const v = variants.filter((x) => ranged.has(lk(s.id, x.id)) && ["accessories", "wellness", "apparel", "grow"].includes(x.cat))[i % 6];
    return { id: uid(), storeId: s.id, variantId: v.id, qty: int(4, 12), unitCostCents: Math.round(v.wholesale * 0.95), note: pick(["Overstocked after a slow month", "Surplus from a cancelled event", "Seasonal clear-out"]) };
  }));
  await db.counter.createMany({
    data: [
      { key: "MEMBER", value: memberSeq }, { key: "PO", value: poSeq }, { key: "ST", value: stSeq },
      // The trade channel's sequences (src/lib/trade.ts): live numbering carries on from the demo's.
      { key: "trade-account", value: tradeAccounts.length }, { key: "trade-order", value: tradeOrderSeq }, { key: "trade-invoice", value: tradeInvoiceSeq }, { key: "trade-credit", value: tradeCreditSeq },
    ],
  });

  // ── Launch programme ─────────────────────────────────────────────────────
  // The network opened when trading began; everyone who signed up before was on the waitlist.
  const launchAt = daysAgo(DAYS);
  await db.setting.create({ data: { key: "launch", value: { phase: "STORES", launchAt: launchAt.toISOString(), foundingCap: 10_000, foundingTier: "SPROUT", foundingMonths: 12, referralBoost: 250 } } });
  // Demo bank details so pro formas print in full; the real account goes in at HQ → Settings → Trade before go-live.
  await db.setting.create({ data: { key: "trade", value: { bank: { bank: "Demo Bank", accountName: "Herbal Holland (Pty) Ltd (Trade)", accountNumber: "0000000000", branchCode: "000000" } } } });
  const founding = await (await import("../src/server/launch")).assignFounding(NOW);
  const nextAt = (dow: number, hh: number) => {
    for (let i = 1; i <= 7; i++) {
      const k = dayKey(new Date(NOW.getTime() + i * DAY));
      if (new Date(`${k}T12:00:00+02:00`).getUTCDay() === dow) return new Date(`${k}T${String(hh).padStart(2, "0")}:00:00+02:00`);
    }
    return NOW;
  };
  // All variants of these products.
  const vids = (...slugs: string[]) => variantRows.filter((v) => slugs.some((s) => productIdBySlug[s] === v.productId)).map((v) => v.id as string);
  const hoodie = uid();
  await db.drop.createMany({
    data: [
      { id: uid(), slug: "heritage-cap-and-hat", name: "Heritage Month: cap + bucket hat", blurb: "The Mark, embroidered on our washed-cotton cap and our sun-ready bucket hat, for Heritage Month.", variantIds: vids("windmill-cap", "sunset-bucket-hat"), startsAt: daysAgo(2), endsAt: daysAgo(-5), earlyTier: "BLOOM", earlyMinutes: 60, perMemberLimit: 2, notifiedEarlyAt: daysAgo(2), notifiedAt: daysAgo(2) },
      { id: hoodie, slug: "sunset-hoodie-no-1", name: "Sunset Hoodie No. 1", blurb: "A numbered first run of our brushed-fleece hoodie. One per member; Harvest members get in two hours early.", variantIds: vids("sunset-hoodie"), startsAt: nextAt(5, 9), earlyTier: "HARVEST", earlyMinutes: 120, perMemberLimit: 1 },
    ],
  });
  const fans = customers.filter((c) => c.email && chance(0.03)).slice(0, 400);
  await db.dropWatch.createMany({ data: fans.map((c) => ({ dropId: hoodie, customerId: c.id })) });
  const events = [
    ...stores.filter((x) => x.status === "OPENING_SOON").map((x) => ({ id: uid(), slug: `opening-${x.slug}`, storeId: x.id, title: `Windmill Days: ${x.name} opening weekend`, blurb: `Our ${x.name} store opens its doors. Meet the team, taste Rooibos & CBD tea, and pick up a welcome gift. Adults 18+, ID at the door.`, startsAt: nextAt(6, 10), endsAt: nextAt(6, 18), capacity: 250 })),
    { id: uid(), slug: "hatfield-members-evening", storeId: stores.find((x) => x.code === "PTA01")!.id, title: "Members' evening: heritage landraces", blurb: "An evening with our growers from Lusikisiki: the story behind Mpondo Gold. Rewards members only, adults 18+.", startsAt: nextAt(4, 18), endsAt: new Date(nextAt(4, 18).getTime() + 150 * 60_000), capacity: 80 },
  ];
  await db.storeEvent.createMany({ data: events });
  const guests = customers.filter((c) => chance(0.01)).slice(0, 300);
  await db.rsvp.createMany({ data: guests.map((c, i) => ({ eventId: events[i % events.length].id, customerId: c.id, code: uid().replace(/-/g, "").slice(0, 8).toUpperCase() })), skipDuplicates: true });
  const offers = await (await import("../src/server/offers")).generateOffers(NOW);
  console.log(`  founding members       ${founding.assigned.toLocaleString()}`);
  console.log(`  drops · events         2 · ${events.length} (${guests.length} RSVPs, ${fans.length} drop watchers)`);
  console.log(`  My Deals loaded        ${offers.created.toLocaleString()}`);

  // ── Franchise leads (HQ → Franchise leads): enquiries from herbalholland.com/franchise at each stage, numbered through
  // the counter (the next real enquiry continues the sequence), with the audit history working them would have left.
  // Demo people with example.co.za addresses.
  const { nextNumber } = await import("../src/server/counters");
  const hqPerson = (name: string) => users.find((u) => u.name === name)!;
  const naledi = hqPerson("Naledi Khumalo");
  const ayesha = hqPerson("Ayesha Patel");
  type LeadMove = [daysAgo: number, to: LeadStatusKey, by: typeof naledi, note: string];
  const demoLeads: {
    name: string; area: string; province: string; capital: string; pharmacist: boolean; experience: string; message?: string; source?: string;
    received: number; owner?: typeof naledi; moves: LeadMove[]; disclosure?: number;
  }[] = [
    {
      name: "Riaan Swanepoel", area: "Durbanville, Cape Town", province: "WC", capital: "under-1.5m", pharmacist: false, received: 52, owner: naledi,
      experience: "Managed a sports store at Canal Walk for six years; before that, assistant manager at a garden centre in Durbanville.",
      message: "Could I start smaller, with a kiosk in a centre?",
      moves: [[50, "CONTACTED", naledi, "Called him: keen, but the capital is well short of a store for now."], [31, "NOT_A_FIT", naledi, "Agreed to talk again next year; he'll keep saving."]],
    },
    {
      name: "Chanelle Pillay", area: "Ballito", province: "KZN", capital: "1.5-3m", pharmacist: true, received: 44, owner: naledi, source: "linkedin", disclosure: 9,
      experience: "I've owned a pharmacy in Salt Rock for nine years and I'm its responsible pharmacist. Before that I ran a health shop at Ballito Junction.",
      message: "We have a unit in mind at the Ballito Lifestyle Centre.",
      moves: [
        [43, "CONTACTED", naledi, "Called; she'd run it next to her pharmacy, with her husband managing the store."],
        [30, "INFO_EVENING", naledi, "Came to the Durban information evening with her husband."],
        [9, "DISCLOSURE_SENT", naledi, "Disclosure document and draft agreement emailed."],
      ],
    },
    {
      name: "Sibusiso Ndlovu", area: "Rosebank, Johannesburg", province: "GP", capital: "3-5m", pharmacist: false, received: 27, owner: ayesha, source: "fasa",
      experience: "Twelve years in retail banking, the last five running a branch in Sandton. I co-own two fast-food franchises in Soweto.",
      moves: [[25, "CONTACTED", ayesha, "Spoke for 40 minutes; he's looking at Rosebank or Parkhurst."], [12, "INFO_EVENING", ayesha, "Booked for the Johannesburg information evening."]],
    },
    {
      name: "Fatima Moosa", area: "Pietermaritzburg", province: "KZN", capital: "discuss", pharmacist: true, received: 13, owner: naledi,
      experience: "My brother and I run the family pharmacy in Scottsville that our father opened in 1994. I manage the front shop and the team of nine.",
      message: "We'd like to talk about converting part of the shop.",
      moves: [[11, "CONTACTED", naledi, "Her brother is the pharmacist; they'd like to come to the Durban evening."]],
    },
    {
      name: "Johan van der Merwe", area: "Menlyn, Pretoria", province: "GP", capital: "over-5m", pharmacist: false, received: 3, moves: [],
      experience: "I own two franchised coffee shops, in Menlyn and Brooklyn, and ran a hardware store in Silverton for ten years before that.",
    },
    {
      name: "Lindiwe Mthembu", area: "Morningside, Durban", province: "KZN", capital: "1.5-3m", pharmacist: false, received: 0.3, source: "linkedin", moves: [],
      experience: "Area manager for a national pharmacy chain in eThekwini for eight years: fifteen stores and about 120 people.",
      message: "Is there space for a store near Florida Road?",
    },
  ];
  const leadRows: Prisma.FranchiseLeadCreateManyInput[] = [];
  const leadAudit: Prisma.AuditLogCreateManyInput[] = [];
  for (const [i, d] of demoLeads.entries()) {
    const id = uid();
    const number = leadNumber(await nextNumber(db, "FRANCHISE_LEAD"));
    const at = (days: number) => new Date(NOW.getTime() - days * DAY);
    const user = (u: typeof naledi) => ({ actorType: "USER", actorId: u.id as string, actorName: u.name });
    leadAudit.push({ id: uid(), at: at(d.received), actorType: "SYSTEM", actorName: "herbalholland.com", action: "lead.create", entity: "FranchiseLead", entityId: id, data: { number, area: d.area } });
    let status: LeadStatusKey = "NEW";
    let notes: string | null = null;
    if (d.owner) leadAudit.push({ id: uid(), at: at(d.moves[0]?.[0] ?? d.received - 0.1), ...user(d.owner), action: "lead.update", entity: "FranchiseLead", entityId: id, data: { number, owner: { from: null, to: d.owner.name } } });
    for (const [days, to, by, note] of d.moves) {
      const sent = to === "DISCLOSURE_SENT" && d.disclosure != null ? dayKey(at(d.disclosure)) : null;
      notes = appendNote(notes, noteLine({ at: at(days), by: by.name, from: status, to, note }));
      leadAudit.push({ id: uid(), at: new Date(at(days).getTime() + 60_000), ...user(by), action: "lead.update", entity: "FranchiseLead", entityId: id, data: { number, status: { from: status, to }, note: "added", ...(sent && { disclosureSentAt: { from: null, to: sent } }) } });
      status = to;
    }
    leadRows.push({
      id, number, name: d.name, email: `${d.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.co.za`, phone: `+2782555${String(1100 + i).padStart(4, "0")}`,
      area: d.area, province: d.province, experience: d.experience, capital: d.capital, pharmacist: d.pharmacist, message: d.message ?? null, source: d.source ?? null,
      status, ownerId: (d.owner?.id as string | undefined) ?? null, notes, disclosureSentAt: d.disclosure != null ? midnight(keyOf(d.disclosure)) : null,
      createdAt: at(d.received), updatedAt: at(d.moves.at(-1)?.[0] ?? d.received),
    });
  }
  await insert("franchise leads", db.franchiseLead, leadRows);
  await insert("franchise lead history", db.auditLog, leadAudit);

  // Fresh planner statistics, as autovacuum gives a live database (without them small tables like Product have none,
  // and the planner picks network-wide scans for store-level queries).
  await db.$executeRawUnsafe("ANALYZE");

  // Franchise statements settled by EFT a week into the next month, all but the latest (not yet due); one store paid part.
  const { franchiseStatement } = await import("../src/server/finance");
  const franchiseStores = active.filter((x) => companies.find((c) => c.id === companyId[x.companyKey])?.kind === "FRANCHISEE");
  const paidMonths = [...new Set(dayKeys.map((d) => d.slice(0, 7)))].slice(0, -2);
  const statementPayments: Prisma.StatementPaymentCreateManyInput[] = [];
  for (const month of paidMonths) {
    for (const st of franchiseStores) {
      const { net } = await franchiseStatement(st.id as string, month);
      const amountCents = -(st.code === "DBN01" ? Math.round(net * 0.6) : net);
      if (!amountCents) continue;
      const [y, m] = month.split("-").map(Number);
      const paidOn = new Date(Date.UTC(y, m, int(5, 9)));
      statementPayments.push({ storeId: st.id as string, companyId: companyId[st.companyKey], month, amountCents, paidOn, reference: `HH ${st.code} ${month.replace("-", "")}`, createdById: naledi.id as string, createdAt: new Date(paidOn.getTime() + 10 * 3600_000) });
    }
  }
  await insert("statement payments", db.statementPayment, statementPayments);

  // The books start on the day of the first stock received (the cut-over), with what HQ owed members in points from
  // before then (sign-up points since they joined) as its opening balance; then every company's postings to today, as
  // the nightly job would have made them.
  const { booksFor, createManualJournal, ledgerBackfill } = await import("../src/server/ledger/core");
  const { tx } = await import("../src/server/db");
  const [{ first }] = await db.$queryRaw<{ first: Date }[]>`SELECT MIN("createdAt") AS first FROM "StockMovement"`;
  const start = dayKey(first);
  const openingDay = dayKey(addDays(new Date(`${start}T12:00:00+02:00`), -1));
  const [{ points }] = await db.$queryRaw<{ points: bigint }[]>`SELECT COALESCE(SUM(points), 0)::bigint AS points FROM "LoyaltyEntry" WHERE "createdAt" < ${new Date(`${start}T00:00:00+02:00`)}`;
  if (points) {
    const hqBooks = await tx((t) => booksFor(t, hq.id as string));
    const cents = Number(points) * POINT_VALUE_CENTS;
    await createManualJournal({
      companyId: hq.id as string, date: openingDay, memo: "Opening balances: Rewards points members held at the cut-over", source: "opening", post: true,
      actor: { type: "USER", id: naledi.id as string, name: naledi.name }, lines: [{ accountId: hqBooks.accounts.get("retained")!, cents }, { accountId: hqBooks.accounts.get("points")!, cents: -cents }],
    });
  }
  // A load-test network (synthetic stores) posts its last week only, and imports no bank statements: its whole history
  // would take hours to post.
  const books = await ledgerBackfill(extra ? dayKey(addDays(NOW, -7)) : start, TODAY);

  // Each franchisee banks with FNB: R350,000 in the bank at the cut-over, and its statement since trading began imported
  // as its accountant (or owner) would. Deposits, PayShap and EFT takings, expenses and statement payments match
  // themselves; card payouts (net of a 2.75% fee) and the monthly account fees are allocated; the last two days' payouts
  // and an insurance debit order are still to do.
  const { allocateLine, createBankAccount, importStatement, matchLine } = await import("../src/server/ledger/bank");
  const fnbDay = (d: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00Z`));
  const plain = (s: string) => s.replace(/[',]/g, "").slice(0, 40);
  const [stmtFrom, stmtTo] = [dayKeys[0], dayKeys[dayKeys.length - 2]];
  const settled = dayKey(addDays(new Date(`${stmtTo}T12:00:00+02:00`), -2));
  const PAID_FROM_BANK: Record<string, string> = { "store-day": "PayShap and EFT receipts", deposit: "Cash Deposit", expense: "FNB App Payment To", "statement-payment": "Payment To Herbal Holland", "supplier-payment": "FNB App Payment To" };
  let bankLines = 0, allocated = 0;
  for (const co of extra ? [] : companies.filter((c) => c.kind === "FRANCHISEE")) {
    const coId = co.id as string;
    const person = users.find((u) => u.companyId === coId && u.role === "ACCOUNTANT") ?? users.find((u) => u.companyId === coId && u.role === "OWNER");
    if (!person) continue;
    const by = { id: person.id as string, name: person.name };
    const book = await tx((t) => booksFor(t, coId));
    const [bankId, cardId] = [book.accounts.get("bank")!, book.accounts.get("card")!];
    await createManualJournal({
      companyId: coId, date: openingDay, memo: "Opening balances: the bank at the cut-over", source: "opening", post: true, actor: { type: "USER", ...by },
      lines: [{ accountId: bankId, cents: 35_000_000 }, { accountId: book.accounts.get("capital")!, cents: -35_000_000 }],
    });
    const acct = await createBankAccount(coId, { bank: "FNB", name: "Gold Business Account", number: `62${int(100_000_000, 999_999_999)}` }, by);
    const posted = await db.$queryRaw<{ id: string; source: string; memo: string; day: string; store: string | null; cents: bigint }[]>`
      SELECT j.id, j.source, j.memo, to_char(j.date, 'YYYY-MM-DD') AS day, s.code AS store, SUM(l."amountCents")::bigint AS cents
      FROM "JournalLine" l JOIN "Journal" j ON j.id = l."journalId" LEFT JOIN "Store" s ON s.id = j."storeId"
      WHERE l."companyId" = ${coId} AND l."accountId" = ${bankId} AND j.status = 'POSTED' AND j.date BETWEEN ${stmtFrom}::date AND ${stmtTo}::date
      GROUP BY j.id, s.code HAVING SUM(l."amountCents") <> 0`;
    const cards = await db.$queryRaw<{ day: string; storeId: string; store: string; cents: bigint }[]>`
      SELECT to_char(j.date, 'YYYY-MM-DD') AS day, s.id AS "storeId", s.code AS store, SUM(l."amountCents")::bigint AS cents
      FROM "JournalLine" l JOIN "Journal" j ON j.id = l."journalId" JOIN "Store" s ON s.id = l."storeId"
      WHERE l."companyId" = ${coId} AND l."accountId" = ${cardId} AND j.source = 'store-day' AND j.date BETWEEN ${stmtFrom}::date AND ${stmtTo}::date
      GROUP BY 1, 2, 3 HAVING SUM(l."amountCents") > 0`;
    type Planned = { day: string; cents: number; d: [string, string, string]; journalId?: string; payout?: { feeCents: number; feeVatCents: number; storeId: string }; fee?: boolean };
    const plan: Planned[] = posted.filter((p) => PAID_FROM_BANK[p.source]).map((p) => ({ day: p.day, cents: Number(p.cents), d: [PAID_FROM_BANK[p.source], p.store ?? "", plain(p.memo)], journalId: p.id }));
    for (const c of cards) {
      const gross = Number(c.cents), feeCents = Math.round(gross * 0.0275), day = dayKey(addDays(new Date(`${c.day}T12:00:00+02:00`), 1));
      if (day <= stmtTo) plan.push({ day, cents: gross - feeCents, d: ["Merchant Settlement", `YOCO ${c.store}`, c.day], payout: { feeCents, feeVatCents: co.vatNumber ? Math.round((feeCents * 15) / 115) : 0, storeId: c.storeId } });
    }
    for (const m of new Set(dayKeys.map((d) => d.slice(0, 7)))) {
      const last = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).toISOString().slice(0, 10);
      if (last >= stmtFrom && last <= stmtTo) plan.push({ day: last, cents: -18_975, d: ["#Monthly Account Fee", "", ""], fee: true });
    }
    plan.push({ day: stmtTo, cents: -245_000, d: ["Debit Order", "SANTAM INSURANCE", "POLICY 4471"] });
    plan.sort((a, b) => a.day.localeCompare(b.day));
    let balance = 35_000_000;
    const rows = plan.map((l, i) => `5,${i + 1},'${fnbDay(l.day)}','${l.d[0]}','${l.d[1]}','${l.d[2]}',${(l.cents / 100).toFixed(2)},${((balance += l.cents) / 100).toFixed(2)},0.00`);
    const csv = [
      `2,'${acct.number}','Gold Business Account','${plain(co.legalName as string).toUpperCase()}'`,
      "3,'Statement Number','Statement Date','Opening Balance','Closing Balance','VAT Amount','Interest Rate'",
      `3,'1','${stmtTo.replace(/-/g, "/")}','350000.00','${(balance / 100).toFixed(2)}','0.00','0.00'`,
      "5,'Number','Date','Description1','Description2','Description3','Amount','Balance','Accrued Charges'",
      ...rows,
    ].join("\r\n");
    await importStatement(coId, acct.id, { file: new File([csv], `fnb-${stmtTo}.csv`, { type: "text/csv" }), format: "FNB" }, by);
    bankLines += plan.length;
    for (const l of await db.bankLine.findMany({ where: { bankAccountId: acct.id, status: "UNMATCHED" }, select: { id: true, date: true, amountCents: true, description: true } })) {
      const day = l.date.toISOString().slice(0, 10);
      // Two of the company's stores paying the same on the same day don't match by themselves: matched by store here.
      const p = day <= settled ? plan.find((x) => x.day === day && x.cents === l.amountCents && l.description.includes(x.d.filter(Boolean).join(" "))) : undefined;
      if (p?.journalId) await matchLine(coId, l.id, { id: p.journalId }, by);
      else if (p?.payout) await allocateLine(coId, l.id, { kind: "payout", ...p.payout, clears: "card" }, by);
      else if (p?.fee) await allocateLine(coId, l.id, { kind: "account", accountId: book.accounts.get("exp.BANK_FEES")!, vatCents: co.vatNumber ? 2_475 : 0 }, by);
      if (p?.payout || p?.fee) allocated++;
    }
  }
  await db.$executeRawUnsafe(`ANALYZE "Journal", "JournalLine", "LedgerBalance", "LedgerAccount"`);
  console.log(`  books                  ${books.journals.toLocaleString()} journals from ${books.queued.toLocaleString()} postings${books.failed ? ` · ${books.failed} FAILED (see LedgerQueue)` : ""} · ${bankLines.toLocaleString()} bank statement lines, ${allocated.toLocaleString()} allocated`);

  // Commission: Mokoena Retail pays it at Hatfield and Brooklyn; last month is approved at Hatfield.
  const { approveMonth, thisMonth } = await import("../src/server/commission");
  await db.store.updateMany({ where: { code: { in: ["PTA01", "PTA02"] } }, data: { commissionOn: true } });
  const pta01 = active.find((x) => x.code === "PTA01")!;
  const thabo = users.find((u) => u.role === "OWNER" && u.companyId === companyId[pta01.companyKey])!;
  const lastMonth = dayKey(new Date(new Date(`${thisMonth(NOW)}-01T12:00:00+02:00`).getTime() - 5 * DAY)).slice(0, 7);
  await approveMonth(pta01.id, lastMonth, { type: "USER", id: thabo.id as string, name: thabo.name });

  // Loss prevention: the nightly rules over the demo's trading (+ the short deposit, raised when it was recorded).
  const { runLossRules, raiseAlerts } = await import("../src/server/loss");
  const { shortDepositAlert } = await import("../src/server/banking");
  if (shortDeposit)
    await raiseAlerts([shortDepositAlert(shortDeposit as Parameters<typeof shortDepositAlert>[0], shortStore.code, shifts.filter((x) => x.depositId === shortDeposit!.id).length)]);
  const loss = await runLossRules(NOW);

  // Campaign Studio: the opening campaign for a store that's opening soon, laid out and approved, and the brand launch
  // as drafts, each on the first day it can start (src/lib/studio-playbooks/).
  const { createPlan, approveItems, playbookOf } = await import("../src/server/studio");
  const { firstDayT } = await import("../src/lib/studio");
  const dayT = (key: string, days: number) => firstDayT(playbookOf(key)!, dayKey(new Date(NOW.getTime() + days * DAY)));
  const studioActor = { type: "USER" as const, id: users[0].id as string, name: users[0].name as string };
  const soon = stores.find((x) => x.status === "OPENING_SOON" && x.kind === "RETAIL");
  let studioItems = 0;
  if (soon) {
    const plan = await createPlan({ playbook: "store-opening", anchor: dayT("store-opening", 40), storeId: soon.id, by: studioActor.name, actor: studioActor }, NOW);
    studioItems += (await approveItems(plan.id, "all", studioActor.name, studioActor)).approved;
  }
  await createPlan({ playbook: "brand-launch", anchor: dayT("brand-launch", 7), storeId: null, by: studioActor.name, actor: studioActor }, NOW);
  console.log(`  banking · alerts       ${depositRows.length} deposits · ${loss.raised} loss-prevention alerts`);
  console.log(`  studio                 ${soon ? `store opening for ${soon.name} (${studioItems} posts approved) · ` : ""}brand launch drafts`);
  const gross = sales.reduce((a, s) => a + (s.totalCents as number), 0);
  const tradeSales = sales.filter((s) => s.channel === "WHOLESALE");
  console.log(`  trade                  ${tradeAccounts.length} accounts · ${tradeOrderRows.length} orders · ${tradeInvoiceSeq} invoices · ${tradeTillSales} till sales · ${ledgerRows.length} ledger entries`);
  console.log(`\nDone. ${active.length} trading stores · ${customers.length.toLocaleString()} members · ${sales.length.toLocaleString()} sales · R${(gross / 100 / 1e6).toFixed(2)}m turnover · trade: ${tradeAccounts.length} accounts · ${tradeOrderRows.length} orders · ${tradeInvoiceSeq} invoices · ${tradeTillSales} till sales · R${(tradeSales.reduce((a, s) => a + (s.totalCents as number), 0) / 100 / 1e3).toFixed(1)}k.`);
  console.log("Demo logins (password: holland). HQ: hq@herbalholland.com · Owner: thabo@mokoenaretail.co.za · Accountant: books@mokoenaretail.co.za · Manager: manager.pta01@herbalholland.com · POS PINs: 1111 (manager), 2222, 3333, 4444 · Trade buyer: trade@greenleafpharmacy.co.za at /trade/login (the code is shown in demo mode)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
