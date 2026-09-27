// Demo network generator. Simulates DAYS of trading across the store network with
// the same rules the platform enforces (FEFO, licences, medical authorisations,
// s18A incentive exclusions, loyalty, promotions) and writes rollups from the same
// records, so every report reconciles.
//
//   npm run db:seed                      # 24 named stores, 60 days
//   SEED_DAYS=90 SEED_STORES=200 npm run db:seed   # scale test (synthetic stores)
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSecret } from "../src/server/crypto";
import { allocate } from "../src/lib/fefo";
import { pointsFor, tierFor, DEFAULT_TIER_SAVINGS, type TierKey } from "../src/lib/loyalty-rules";
import { vatOf } from "../src/lib/money";
import { dayKey } from "../src/lib/format";
import { applyPromotions, type PromoInput } from "../src/lib/promotions";
import { promoWindowOpen } from "../src/lib/pricing-rules";
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

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) throw new Error("Refusing to seed in production (pass --force)");
  console.log(`Seeding Herbal Holland demo network — ${DAYS} days to ${TODAY}`);
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);

  // ── Network ─────────────────────────────────────────────────────────────
  const hq = { id: uid(), kind: "FRANCHISOR" as const, ...HQ_COMPANY };
  const regionId = Object.fromEntries(REGIONS.map((r) => [r.code, uid()]));
  const companies: Prisma.CompanyCreateManyInput[] = [hq];
  const companyId: Record<string, string> = {};
  for (const o of OWNERS) {
    companyId[o.key] = uid();
    companies.push({ id: companyId[o.key], kind: "FRANCHISEE", name: o.legalName.replace(" (Pty) Ltd", ""), legalName: o.legalName, contactName: o.contact, email: o.email, vatNumber: o.vat, phone: `0${int(10, 87)} ${int(100, 999)} ${int(1000, 9999)}`, regNumber: `20${int(15, 24)}/${int(100000, 999999)}/07` });
  }

  // Optional synthetic stores for scale testing.
  const CITIES = [["Pretoria", "GP", "GPN"], ["Johannesburg", "GP", "GPS"], ["Cape Town", "WC", "WC"], ["Durban", "KZN", "KZN"], ["Gqeberha", "EC", "INT"], ["Bloemfontein", "FS", "INT"], ["Polokwane", "LP", "INT"], ["Rustenburg", "NW", "GPN"], ["Kimberley", "NC", "INT"]] as const;
  const extra = Math.max(0, Number(process.env.SEED_STORES ?? 0) - STORES.length);
  const synthetic: StoreSeed[] = Array.from({ length: extra }, (_, i) => {
    const [city, province, region] = pick(CITIES);
    const owner = `syn${Math.floor(i / 3)}`;
    if (!companyId[owner]) {
      companyId[owner] = uid();
      companies.push({ id: companyId[owner], kind: "FRANCHISEE", name: `Franchisee ${Math.floor(i / 3) + 1}`, legalName: `Franchisee ${Math.floor(i / 3) + 1} (Pty) Ltd`, vatNumber: `49${String(i).padStart(8, "0")}`, email: `owner${Math.floor(i / 3) + 1}@example.co.za` });
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
    storeRows.push({ id: dcId[d.code], code: d.code, slug: d.slug, name: d.name, kind: "WAREHOUSE", status: "ACTIVE", format: "STANDARD", companyId: hq.id, regionId: regionId[d.region], addressLine: d.addressLine, suburb: d.suburb, city: d.city, province: d.province, postalCode: d.postalCode, lat: d.lat, lng: d.lng, clickCollect: false, sameDay: false, licences: ["THC"], licenceRef: `SAHPRA 22C licence (DC) — demo ref`, email: `${d.slug}@herbalholland.co.za`, phone: "012 004 4200", openedAt: daysAgo(400) });
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
      phone: `0${int(10, 87)} ${int(100, 999)} ${int(1000, 9999)}`, whatsapp: `+2771${int(1000000, 9999999)}`, email: `${s.slug}@herbalholland.co.za`, hours: HOURS,
      clickCollect: status === "ACTIVE", sameDay: !!s.sameDay, licences: status === "ACTIVE" ? ["THC"] : [], licenceRef: status === "ACTIVE" ? `SAHPRA 22C/${s.code}/2026 (demo ref)` : null,
      royaltyBps: 600, levyBps: 200, ecomBps: 1000, receiptFooter: "Adults 18+ only. Keep out of reach of children. Thank you for choosing Herbal Holland.",
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
  const PASSWORD = hashSecret("holland");
  const PIN = { "1111": hashSecret("1111"), "2222": hashSecret("2222"), "3333": hashSecret("3333"), "4444": hashSecret("4444") };
  const users: Prisma.UserCreateManyInput[] = [
    { id: uid(), name: "Naledi Khumalo", email: "hq@herbalholland.co.za", role: "HQ_ADMIN", passwordHash: PASSWORD, companyId: hq.id },
    { id: uid(), name: "Pieter de Vries", email: "merch@herbalholland.co.za", role: "HQ_STAFF", passwordHash: PASSWORD, companyId: hq.id },
    { id: uid(), name: "Ayesha Patel", email: "marketing@herbalholland.co.za", role: "HQ_STAFF", passwordHash: PASSWORD, companyId: hq.id },
    { id: uid(), name: "Johan Botha", email: "finance@herbalholland.co.za", role: "HQ_STAFF", passwordHash: PASSWORD, companyId: hq.id },
  ];
  const areaNames = ["Karabo Molefe", "Chantelle Hendricks", "Wian Steyn", "Zinhle Cele", "Deon Olivier"];
  REGIONS.forEach((r, i) => users.push({ id: uid(), name: areaNames[i], email: `area.${r.code.toLowerCase()}@herbalholland.co.za`, role: "AREA_MANAGER", passwordHash: PASSWORD, regionId: regionId[r.code] }));
  for (const o of OWNERS) users.push({ id: uid(), name: o.contact, email: o.email, role: "OWNER", passwordHash: PASSWORD, companyId: companyId[o.key] });
  const person = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  for (const s of retail) {
    const code = s.code.toLowerCase();
    const team: [string, "MANAGER" | "BUDTENDER", keyof typeof PIN, boolean, string | null][] = [
      [person(), "MANAGER", "1111", true, `manager.${code}@herbalholland.co.za`],
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
  const CAT_CODE: Record<string, string> = { flower: "FLW", "pre-rolls": "PRE", edibles: "EDB", vapes: "VAP", concentrates: "CON", wellness: "WEL", accessories: "ACC", grow: "GRW", apparel: "APP" };
  type SimVariant = { id: string; sku: string; productId: string; slug: string; name: string; label: string; grams: number | null; price: number; wholesale: number; cost: number; reg: string; cat: string; heritage: boolean; featured: boolean; tobacco: boolean; line?: string; shelfMonths: number; supplier: string; thc?: [number, number]; cbd?: [number, number]; terps?: [string, number][] };
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
    const legalBasis = p.reg === "THC" ? "SAHPRA licence — medical pathway (Section 21 authorisation required)" : p.reg === "CBD" ? "Schedule 0 CBD — GN 586 of 22 May 2020" : p.reg === "HEMP" ? "Hemp — Plant Improvement Act 2018 (≤ 2% THC)" : null;
    productRows.push({
      id: pid, slug: p.slug, name: p.name, tagline: p.tagline, line: p.line, categoryId: catId[p.cat], description: p.desc, strain: p.strain,
      thcMin: p.thc?.[0] ?? (p.reg === "CBD" ? 0 : null), thcMax: p.thc?.[1] ?? (p.reg === "CBD" ? 0.001 : null), cbdMin: p.cbd?.[0], cbdMax: p.cbd?.[1],
      terpenes: p.terps ? p.terps.map(([name, pct]) => ({ name, pct })) : undefined, effects: p.effects ?? [], flavours: p.flavours ?? [],
      lineage: p.lineage, origin: p.origin, heritage: !!p.heritage, regClass: p.reg, legalBasis, cbdMgPerPack: p.cbdPack, cbdMgPerDay: p.cbdDay,
      claims: p.claims ?? [], tobaccoRelated: !!p.tobacco, featured: !!p.featured, status: "ACTIVE", createdAt: daysAgo(int(120, 400)),
    });
    const code = p.slug.split("-").slice(0, 2).map((w) => w.slice(0, 2).toUpperCase()).join("");
    p.variants.forEach(([label, grams, rand$], vi) => {
      const id = uid();
      const price = rand$ * 100;
      const wholesale = Math.round((price / 1.15) * (p.reg === "THC" ? 0.52 : p.reg === "APPAREL" ? 0.5 : 0.55));
      const cost = Math.round(wholesale * (p.reg === "THC" ? 0.55 : 0.62));
      const sku = `${CAT_CODE[p.cat]}-${code}${pi}-${label.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)}`;
      variantRows.push({ id, productId: pid, sku, barcode: eanCheck(`6001234${String(ean++).padStart(5, "0")}`), name: label, grams, priceCents: price, wholesaleCents: wholesale, costCents: cost, sortOrder: vi });
      variants.push({ id, sku, productId: pid, slug: p.slug, name: p.name, label, grams, price, wholesale, cost, reg: p.reg, cat: p.cat, heritage: !!p.heritage, featured: !!p.featured, tobacco: !!p.tobacco, line: p.line, shelfMonths: p.shelfMonths, supplier: p.supplier, thc: p.thc, cbd: p.cbd, terps: p.terps });
    });
  });
  const vById = new Map(variants.map((v) => [v.id, v]));

  // ── Batches ─────────────────────────────────────────────────────────────
  type SimBatch = { id: string; code: string; variantId: string; packedAt: Date; expiresAt: Date | null; unsellableFrom?: Date; status: "RELEASED" | "QUARANTINE" | "RECALLED"; reason?: string };
  const batches: SimBatch[] = [];
  const batchRows: Prisma.BatchCreateManyInput[] = [];
  const tested = new Set(["THC", "CBD", "HEMP"]);
  for (const v of variants) {
    const cannabis = tested.has(v.reg);
    const packs = cannabis ? [DAYS + 110, DAYS + 25, Math.round(DAYS / 3)] : [DAYS + 90, Math.round(DAYS / 2)];
    packs.forEach((ago, i) => {
      const letter = "ABC"[i];
      const packedAt = daysAgo(ago + rand(0, 3));
      let expiresAt = v.shelfMonths ? new Date(packedAt.getTime() + v.shelfMonths * 30.4 * DAY) : null;
      // Edibles' oldest batch is close to expiry — drives markdown/expiry reports.
      if (v.cat === "edibles" && i === 0) expiresAt = daysAgo(-int(8, 16));
      if (v.cat === "wellness" && i === 0 && v.reg === "CBD") expiresAt = daysAgo(-int(12, 20));
      const code = `${v.sku.split("-").slice(1).join("-")}-${dayKey(packedAt).slice(2, 7).replace("-", "")}${letter}`;
      const b: SimBatch = { id: uid(), code, variantId: v.id, packedAt, expiresAt, status: "RELEASED" };
      if (v.slug === "rooibos-honey-gummies" && i === 1) Object.assign(b, { status: "RECALLED", unsellableFrom: daysAgo(10), reason: "Voluntary recall: potency label misprint (actual 7.5 mg per piece)" });
      if (v.slug === "tulip-og" && v.label === "3.5g" && i === 2) Object.assign(b, { status: "QUARANTINE", unsellableFrom: daysAgo(3), reason: "Awaiting microbial re-test" });
      batches.push(b);
      const thc = v.thc ? +rand(v.thc[0], v.thc[1]).toFixed(1) : v.reg === "CBD" ? 0 : null;
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
  const PAR: Record<string, number> = { flower: 14, "pre-rolls": 16, edibles: 10, vapes: 8, concentrates: 5, wellness: 8, accessories: 8, grow: 3, apparel: 4 };
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
    lot.unitCost = base + qty > 0 ? Math.round((base * lot.unitCost + qty * unitCost) / (base + qty)) : unitCost;
    lot.onHand += qty;
    lots.set(lk(storeId, variantId), arr);
    movements.push({ id: uid(), storeId, variantId, batchId, qty, type, unitCostCents: unitCost, createdAt: ts, ...extra });
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

  // DC opening stock (from growers & suppliers) — every batch lands at every DC.
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
    { id: uid(), name: "Any 2 CBD wellness for R800", description: "Mix and match any two CBD oils, softgels, balms or teas.", kind: "MULTIBUY", value: 80000, buyQty: 2, categoryIds: [cat("wellness")], productIds: [], channels: ["POS", "ONLINE"], startsAt: daysAgo(DAYS), endsAt: daysAgo(-45) },
    { id: uid(), name: "Rolling essentials: tray + free papers", description: "Buy a Windmill rolling tray and get a booklet of papers free.", kind: "BUY_X_GET_Y", value: 0, buyQty: 1, getQty: 1, rewardPercent: 100, productIds: pids("windmill-rolling-tray"), categoryIds: [], rewardProductIds: pids("king-size-papers"), channels: ["POS", "ONLINE"], startsAt: daysAgo(DAYS), endsAt: daysAgo(-60) },
    { id: uid(), name: "Spend R600, get the Sunset grinder free", description: "Gift with purchase on non-medicinal items.", kind: "BUY_X_GET_Y", value: 0, minSpendCents: 60000, getQty: 1, rewardPercent: 100, productIds: [], categoryIds: [], rewardProductIds: pids("sunset-grinder"), channels: ["POS"], startsAt: daysAgo(21), endsAt: daysAgo(-21) },
    { id: uid(), name: "Happy hour: 10% off accessories", description: "Weekdays 16:00–18:00.", kind: "PERCENT", value: 10, categoryIds: [cat("accessories")], productIds: [], channels: ["POS"], days: [1, 2, 3, 4, 5], startMinute: 16 * 60, endMinute: 18 * 60, startsAt: daysAgo(DAYS), endsAt: daysAgo(-90) },
    { id: uid(), name: "Double Points Fridays", description: "2× points every Friday.", kind: "MULTIPLIER", value: 200, categoryIds: [], productIds: [], channels: ["POS", "ONLINE"], days: [5], startsAt: daysAgo(DAYS), endsAt: daysAgo(-90) },
    { id: uid(), name: "Welcome back: R75 off R400", description: "Win-back offer for members we haven't seen in a while.", code: "WELCOMEBACK", kind: "FIXED", value: 7500, minSpendCents: 40000, categoryIds: [], productIds: [], channels: ["POS", "ONLINE"], startsAt: daysAgo(20), endsAt: daysAgo(-10) },
    { id: uid(), name: "10% off your first online order", code: "WELCOME10", kind: "PERCENT", value: 10, categoryIds: [], productIds: [], channels: ["ONLINE"], startsAt: daysAgo(DAYS), endsAt: daysAgo(-120) },
    { id: uid(), name: "Sea Point: 10% off apparel", description: "Local offer for Atlantic Seaboard visitors.", code: "SEAPOINT10", kind: "PERCENT", value: 10, categoryIds: [cat("apparel")], productIds: [], channels: ["POS"], storeIds: [stores.find((s) => s.code === "CPT01")!.id], ownerStoreId: stores.find((s) => s.code === "CPT01")!.id, startsAt: daysAgo(30), endsAt: daysAgo(-30) },
  ];
  const promoInputs = promoDefs.map((p) => ({
    ...p, code: p.code ?? null, minSpendCents: p.minSpendCents ?? 0, buyQty: p.buyQty ?? null, getQty: p.getQty ?? null, rewardPercent: p.rewardPercent ?? null,
    rewardProductIds: (p.rewardProductIds as string[]) ?? [], rewardCategoryIds: [], categoryIds: p.categoryIds as string[], productIds: p.productIds as string[],
    storeIds: (p.storeIds as string[]) ?? [], channels: p.channels as string[], days: (p.days as number[]) ?? [],
  }));
  const promosAt = (ts: Date, channel: "POS" | "ONLINE", storeId: string) =>
    promoInputs.filter((p) => p.channels.includes(channel) && ts >= (p.startsAt as Date) && ts <= (p.endsAt as Date) && (!p.storeIds.length || p.storeIds.includes(storeId)) && promoWindowOpen(p, ts)) as unknown as PromoInput[];
  const heritagePromoId = promoDefs[0].id;
  const winbackPromoId = promoDefs[6].id;

  // ── Selling ─────────────────────────────────────────────────────────────
  const sales: Prisma.SaleCreateManyInput[] = [];
  const saleLines: Prisma.SaleLineCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const shifts: Prisma.ShiftCreateManyInput[] = [];
  const orders: Prisma.OrderCreateManyInput[] = [];
  const orderLines: Prisma.OrderLineCreateManyInput[] = [];
  type Stat = Omit<Prisma.DailyStoreStatCreateManyInput, "storeId" | "date" | "channel"> & Record<string, number>;
  const storeStats = new Map<string, { storeId: string; date: string; channel: "POS" | "ONLINE"; s: Stat }>();
  const variantStats = new Map<string, { storeId: string; date: string; variantId: string; units: number; netCents: number; costCents: number }>();
  const sold14 = new Map<string, number[]>(); // store|variant → units per day index
  const THC_CATS = ["flower", "pre-rolls", "edibles", "vapes", "concentrates"];
  const CAT_W: [string, number][] = [["flower", 0.5], ["pre-rolls", 0.15], ["edibles", 0.08], ["vapes", 0.08], ["concentrates", 0.04], ["wellness", 0.11], ["accessories", 0.09], ["grow", 0.02], ["apparel", 0.025]];
  const variantsIn = (catSlug: string) => variants.filter((v) => v.cat === catSlug);
  const campaignSends: { id: string; ts: Date; promoId?: string }[] = [];
  const heritageCampaignId = uid(), winbackCampaignId = uid(), balmCampaignId = uid();
  const winbackSend = at(keyOf(20), 10 * 60);
  campaignSends.push({ id: winbackCampaignId, ts: winbackSend, promoId: winbackPromoId });
  if (sep1 > daysAgo(DAYS)) campaignSends.push({ id: heritageCampaignId, ts: at(dayKey(sep1), 9 * 60 + 30), promoId: heritagePromoId });

  function bump(storeId: string, date: string, channel: "POS" | "ONLINE", d: Record<string, number>) {
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
  // when that's lower. Never on licensed medicines (s18A).
  const DEAL_SLUGS = ["calm-cbd-oil-600", "rooibos-cbd-tea", "sunset-grinder", "windmill-rolling-tray", "hemp-hand-cream"];
  const dealFrom = daysAgo(5);
  const deals = new Map(variants.filter((v) => DEAL_SLUGS.includes(v.slug)).map((v) => [v.id, Math.round((v.price * 0.8) / 100) * 100 - 1]));
  const memberUnit = (base: number, v: SimVariant, c: SimCustomer | null, ts: Date) => {
    if (!c || v.reg === "THC") return base;
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
      return { v, qty, unit, noPromo: v.reg === "THC", saved: (base - unit) * qty };
    });
    const saved = priced.reduce((a, p) => a + p.saved, 0);
    const promos = promosAt(ts, o.channel, s.id);
    const pr = applyPromotions(priced.map((p) => ({ key: p.v.id, productId: p.v.productId, categoryId: catId[p.v.cat], qty: p.qty, unitPriceCents: p.unit, noPromo: p.noPromo })), promos, o.code);
    const code = o.code && !pr.codeError ? o.code : null;
    const extra = o.extraCents ?? 0;
    const total = pr.totalCents + extra;
    const lineVat = (cents: number) => (s.vendor ? vatOf(cents) : 0);
    const saleId = uid();
    let cost = 0, units = 0, thcTotal = 0;
    const date = dayKey(ts);
    for (const [i, p] of priced.entries()) {
      const allocations = take(s.id, p.v.id, p.qty, o.channel === "POS" ? "SALE" : "ONLINE", ts, { saleId, orderId: o.orderId, userId: o.staffId ?? undefined });
      const lc = allocations.reduce((a, x) => a + x.qty * x.unitCostCents, 0);
      cost += lc;
      units += p.qty;
      const lt = pr.lines[i].totalCents;
      if (p.noPromo) thcTotal += lt;
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
      earned = pointsFor(Math.max(0, total - loyaltyPts * 100 - thcTotal), c.tier, pr.pointsMultiplier);
      if (earned) {
        c.points += earned;
        loyalty.push({ id: uid(), customerId: c.id, storeId: s.id, points: earned, kind: "EARN", saleId, orderId: o.orderId, createdAt: ts });
      }
      if (c.visits === 0 && c.referredById) {
        const ref = customerById.get(c.referredById);
        loyalty.push({ id: uid(), customerId: c.id, storeId: s.id, points: 50, kind: "REFERRAL", createdAt: ts, note: "Welcome — you were referred" });
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
    const ageRestricted = priced.some((p) => ["THC", "CBD", "HEMP", "ACCESSORY", "GROW"].includes(p.v.reg));
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
    return { saleId, total, pr, thcTotal, payRows };
  }

  // Replenishment, adjustments and stock takes run on the same clock as sales.
  const stockOrders: Prisma.StockOrderCreateManyInput[] = [];
  const stockOrderLines: Prisma.StockOrderLineCreateManyInput[] = [];
  let poSeq = 0;
  function stockOrder(kind: "WHOLESALE" | "NETWORK", buyer: SimStore, seller: SimStore, lines: { v: SimVariant; qty: number; unit: number }[], day: string, status: "RECEIVED" | "SHIPPED" | "APPROVED" | "SUBMITTED") {
    if (!lines.length) return;
    const id = uid();
    const ts = at(day, 9 * 60 + 30);
    const shippedTs = new Date(ts.getTime() - 25 * 3_600_000);
    let sub = 0;
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
      stockOrderLines.push({ id: uid(), stockOrderId: id, variantId: l.v.id, qty: l.qty, unitCostCents: l.unit, shipped, receivedQty: received });
    }
    const vat = Math.round(sub * 0.15);
    stockOrders.push({
      id, number: `PO-${String(++poSeq).padStart(6, "0")}`, kind, status, buyerId: buyer.id, sellerId: seller.id, subtotalCents: sub, vatCents: vat, totalCents: sub + vat,
      createdAt: new Date(ts.getTime() - 50 * 3_600_000), submittedAt: new Date(ts.getTime() - 48 * 3_600_000),
      approvedAt: status !== "SUBMITTED" ? new Date(ts.getTime() - 44 * 3_600_000) : null,
      shippedAt: status === "RECEIVED" || status === "SHIPPED" ? shippedTs : null, receivedAt: status === "RECEIVED" ? ts : null,
      invoiceSentAt: status === "RECEIVED" ? ts : null, notes: kind === "NETWORK" ? "Network trade" : "Weekly replenishment",
    });
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
      if (pos <= Math.max(r.rp, Math.ceil(velocity * 4))) lines.push({ v, qty: target - pos, unit: v.wholesale });
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
    for (const s of active) {
      // Replenishment day: receive before opening.
      if (weekday(k) === replDay.get(s.id) && !isToday) replenish(s, k);
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
      shifts.push({ id: shiftId, storeId: s.id, deviceId: s.deviceId, openedById: manager.id, openedAt: shiftStart, openingFloatCents: 100_000, closedById: closed ? manager.id : null, closedAt: closed ? at(k, open[1] + 10) : null, expectedCashCents: closed ? expected : null, countedCashCents: closed ? expected + variance : null, notes: variance < -5000 ? "Short — investigating" : null });

      // Weekly adjustments.
      if (chance(0.16)) {
        const v = pick(variants.filter((x) => ["accessories", "wellness", "apparel", "pre-rolls"].includes(x.cat) && ranged.has(lk(s.id, x.id))));
        const reason = weighted([["DAMAGED", 0.55], ["SAMPLE", 0.3], ["THEFT", 0.15]] as const);
        if (available(s.id, v.id, at(k, 18 * 60)) > 1) adjustments.push({ storeId: s.id, v, qty: 1, reason, ts: at(k, open[1] - 30) });
      }
    }
    // Apply adjustments for the day.
    for (const a of adjustments.splice(0)) {
      const al = take(a.storeId, a.v.id, a.qty, "ADJUST", a.ts, { reason: a.reason, note: { DAMAGED: "Damaged on shelf", SAMPLE: "Demo unit", THEFT: "Shoplifting — incident logged", EXPIRED: "Expired" }[a.reason], userId: byStoreId.get(a.storeId)!.staff[0].id });
      void al;
    }
    // Expired lots are written off at their expiry.
    for (const s of active)
      for (const v of variants) {
        for (const l of lots.get(lk(s.id, v.id)) ?? []) {
          const b = bById.get(l.batchId)!;
          if (l.onHand > 0 && b.expiresAt && dayKey(b.expiresAt) === k) {
            movements.push({ id: uid(), storeId: s.id, variantId: v.id, batchId: l.batchId, qty: -l.onHand, type: "ADJUST", reason: "EXPIRED", unitCostCents: l.unitCost, createdAt: b.expiresAt, note: "Expired — destroyed", userId: s.staff[0].id });
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
        // Promotions may have changed the price — keep the order in step with the posted sale.
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

    // Win-back audience is defined at send time.
    if (k === keyOf(20)) for (const c of customers) if (c.last && c.visits >= 3 && c.last < daysAgo(60) && c.last > daysAgo(120)) c.atRisk = true;
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
  const footer = `\n— ${HQ_COMPANY.legalName}, ${HQ_COMPANY.address}, ${HQ_COMPANY.phone}, ${HQ_COMPANY.email}. Reply STOP to opt out.`;
  function campaign(id: string, name: string, channel: "SMS" | "EMAIL" | "PUSH" | "WHATSAPP", segment: string, message: string, audience: SimCustomer[], sentAt: Date | null, status: "SENT" | "DRAFT" | "SCHEDULED", promotionId?: string, costCents = 0) {
    const consentKey = channel === "WHATSAPP" ? "WHATSAPP" : channel;
    const reachable = audience.filter((c) => c.consents[consentKey] && (channel !== "EMAIL" || c.email));
    campaigns.push({ id, name, channel, segment, message, promotionId, status, sentAt: status === "SENT" ? sentAt : null, scheduledAt: status === "SCHEDULED" ? sentAt : null, costCents, audienceCount: status === "SENT" ? audience.length : 0, sentCount: status === "SENT" ? reachable.length : 0, suppressedCount: status === "SENT" ? audience.length - reachable.length : 0, createdAt: new Date((sentAt ?? NOW).getTime() - 2 * DAY) });
    if (status === "SENT")
      for (const c of reachable)
        messageRows.push({ id: uid(), campaignId: id, customerId: c.id, to: channel === "EMAIL" ? c.email! : c.phone, channel, kind: "MARKETING", status: "SENT", body: message.replaceAll("{{firstName}}", c.firstName).replaceAll("{{code}}", "WELCOMEBACK") + footer, createdAt: sentAt! });
  }
  if (sep1 > daysAgo(DAYS)) campaign(heritageCampaignId, "Heritage Month launch", "SMS", "ALL", "Hi {{firstName}}, happy Heritage Month from Herbal Holland! 15% off apparel & accessories all September, in store and online.", customers.filter((c) => c.createdAt < sep1), at(dayKey(sep1), 9 * 60 + 30), "SENT", heritagePromoId, 1_850_000);
  campaign(winbackCampaignId, "We miss you — R75 off", "SMS", "AT_RISK", "Hi {{firstName}}, it's been a while! Here's R75 off when you spend R400 on wellness, accessories or apparel. Use code {{code}} by the end of the month.", customers.filter((c) => c.atRisk), winbackSend, "SENT", winbackPromoId, 240_000);
  campaign(balmCampaignId, "New: Recover CBD Muscle Balm", "PUSH", "LOYAL", "New in the wellness range: Recover CBD Muscle Balm — arnica, wintergreen and 500 mg CBD for after the gym.", customers.filter((c) => c.visits >= 5 && c.last && c.last > daysAgo(60)), at(keyOf(8), 11 * 60), "SENT");
  const nextFriday = new Date(NOW.getTime() + ((5 - NOW.getUTCDay() + 7) % 7 || 7) * DAY);
  campaign(uid(), "Double Points Friday", "SMS", "ALL", "Hi {{firstName}}, it's Double Points Friday at Herbal Holland — every rand counts twice today.", [], at(dayKey(nextFriday), 10 * 60), "SCHEDULED");
  campaign(uid(), "Spring grow season", "EMAIL", "PROSPECT", "Hi {{firstName}}, spring is planting season. Everything for the home grow — living soil, nutrients and heritage seeds — is in store now.", [], null, "DRAFT");

  // Reviews, stock alerts, announcements, suppressions, audit trail.
  const reviewRows: Prisma.ReviewCreateManyInput[] = [];
  const reviewed = new Set<string>();
  const REVIEW = {
    5: [["Exactly as described", "Beautiful quality and the budtender knew their stuff."], ["My new favourite", "Consistent every time. Love that I can see the lab results."], ["Worth it", "Great value with my Rewards points. Collection was ready in 10 minutes."]],
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
    reviewRows.push({ id: uid(), productId: v.productId, customerId: sale.customerId, rating, title, body, verified: true, createdAt: new Date((sale.createdAt as Date).getTime() + int(1, 5) * DAY) });
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
  await insert("shifts", db.shift, shifts);
  await insert("orders", db.order, orders);
  await insert("order lines", db.orderLine, orderLines);
  await insert("sales", db.sale, sales.filter((s) => s.kind !== "REFUND"));
  await insert("refunds", db.sale, sales.filter((s) => s.kind === "REFUND"));
  await insert("sale lines", db.saleLine, saleLines);
  await insert("payments", db.payment, payments);
  await insert("stock orders", db.stockOrder, stockOrders);
  await insert("stock order lines", db.stockOrderLine, stockOrderLines);
  await insert("stock takes", db.stockTake, stockTakes);
  await insert("stock take lines", db.stockTakeLine, stockTakeLines);
  await insert("stock movements", db.stockMovement, movements);
  await insert("loyalty ledger", db.loyaltyEntry, loyalty);
  await insert("expenses", db.expense, expenseRows);
  await insert("campaigns", db.campaign, campaigns);
  await insert("messages", db.messageLog, messageRows);
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
  await db.counter.createMany({ data: [{ key: "MEMBER", value: memberSeq }, { key: "PO", value: poSeq }, { key: "ST", value: stSeq }] });

  const gross = sales.reduce((a, s) => a + (s.totalCents as number), 0);
  console.log(`\nDone. ${active.length} trading stores · ${customers.length.toLocaleString()} members · ${sales.length.toLocaleString()} sales · R${(gross / 100 / 1e6).toFixed(2)}m turnover.`);
  console.log("Demo logins (password: holland) — HQ: hq@herbalholland.co.za · Owner: thabo@mokoenaretail.co.za · Manager: manager.pta01@herbalholland.co.za · POS PINs: 1111 (manager), 2222, 3333, 4444");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
