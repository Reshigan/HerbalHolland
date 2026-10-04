// Typo-tolerant admin searches: when nothing matches as typed, members are found by close first or last names and
// products by close product or variant names (pg_trgm), closest first — still bounded to what the person may see.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { closeMembers, memberWhere } from "@/server/hq/crm";
import { closeProducts, productList } from "@/server/hq/catalogue";
import { closeMembersAt, customerSearch, memberAtStore } from "@/server/store/members";
import { searchStock, stockRows } from "@/server/store/inventory";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let other: { id: string };
const m: Record<string, string> = {};
let durban: string, northern: string, preroll: string;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const west = await db.region.create({ data: { code: "WCP", name: "Western Cape" } });
  const rival = await db.company.create({ data: { kind: "FRANCHISEE", name: "Other Retail", legalName: "Other Retail (Pty) Ltd", email: "other@example.co.za" } });
  other = await db.store.create({
    data: { code: "OTH01", slug: "oth01", name: "Other Store", companyId: rival.id, regionId: west.id, addressLine: "1 Long St", suburb: "City Bowl", city: "Cape Town", province: "WC", postalCode: "8001" },
  });
  const member = async (key: string, firstName: string, lastName: string, homeStoreId: string, tier: "SEED" | "HARVEST" = "SEED") => {
    const i = Object.keys(m).length + 10;
    m[key] = (await db.customer.create({ data: { memberNo: `HH00090${i}`, phone: `+278290090${i}`, firstName, lastName, referralCode: `SRCH${i}`, homeStoreId, tier } })).id;
  };
  await member("abrahams", "Mpho", "Abrahams", w.store.id, "HARVEST");
  await member("sipho", "Sipho", "Ndlovu", w.store.id, "HARVEST");
  await member("thandi", "Thandi", "Ndlovu", other.id);
  await member("lindiwe", "Lindiwe", "Ndlovu", other.id); // homed in Cape Town, but has bought at Test Store
  await db.sale.create({ data: { id: crypto.randomUUID(), number: "A-SRCH-1", storeId: w.store.id, customerId: m.lindiwe, subtotalCents: 22_900, totalCents: 22_900, vatCents: 2_987, costCents: 11_000 } });

  const category = await db.category.findFirstOrThrow({ where: { slug: "flower" } });
  const product = (name: string, slug: string, status: "ACTIVE" | "DRAFT") =>
    db.product.create({ data: { slug, name, status, categoryId: category.id, description: "x", regClass: "THC", strain: "SATIVA", effects: [], flavours: [], claims: [] } });
  const dp = await product("Durban Poison", "durban-poison", "ACTIVE");
  const nl = await product("Northern Lights", "northern-lights", "DRAFT");
  durban = dp.id;
  northern = nl.id;
  const variant = (productId: string, sku: string, name: string) => db.variant.create({ data: { productId, sku, name, priceCents: 30_000, wholesaleCents: 14_000, costCents: 8_000 } });
  const dp35 = await variant(dp.id, "DP-35", "3.5g");
  preroll = (await variant(dp.id, "DP-PR", "Pre-roll 0.5g")).id;
  await variant(nl.id, "NL-35", "3.5g");
  // Durban Poison is ranged at Test Store; Northern Lights isn't sold there.
  await db.storeVariant.createMany({ data: [dp35.id, preroll].map((variantId) => ({ storeId: w.store.id, variantId, reorderPoint: 2, parLevel: 6 })) });
});
afterAll(() => db.$disconnect());

describe("Close member matches", () => {
  it("find a misspelt name across the network, closest first, only when the name is a name", async () => {
    expect(await db.customer.count({ where: memberWhere(null, { q: "Abrahms" }) })).toBe(0); // nothing as typed
    expect(await closeMembers(null, { q: "Abrahms" })).toEqual([m.abrahams]);
    expect(await closeMembers(null, { q: "Mpho Abrahms" })).toEqual([m.abrahams]);
    expect((await closeMembers(null, { q: "ndlovo" })).sort()).toEqual([m.sipho, m.thandi, m.lindiwe].sort());
    expect(await closeMembers(null, { q: "ndlovo", tier: "HARVEST" })).toEqual([m.sipho]);
    expect(await closeMembers(null, { q: "xqzvw" })).toEqual([]);
    expect(await closeMembers(null, { q: "0820159585" })).toEqual([]);
  });

  it("stay inside an area manager's region (members homed at its stores)", async () => {
    const gpn = (await db.store.findMany({ where: { regionId: w.region.id }, select: { id: true } })).map((s) => s.id);
    expect(await closeMembers(gpn, { q: "ndlovo" })).toEqual([m.sipho]);
  });

  it("stay inside a store's members and buyers in the back office", async () => {
    expect(await db.customer.count({ where: { AND: [memberAtStore(w.store.id), customerSearch("ndlovo")] } })).toBe(0);
    expect((await closeMembersAt(w.store.id, "ndlovo")).sort()).toEqual([m.sipho, m.lindiwe].sort());
    expect(await closeMembersAt(other.id, "Abrahms")).toEqual([]);
  });
});

describe("Close product matches", () => {
  it("find a misspelt product in the catalogue — drafts too — closest first", async () => {
    expect((await closeProducts("durbn"))[0]).toBe(durban);
    expect(await closeProducts("nothern lights")).toContain(northern);
    expect(await closeProducts("og")).toEqual([]);
    const list = await productList([w.store.id], { q: "durbn" }, 1, 25);
    expect(list).toMatchObject({ close: true, total: 1 });
    expect(list.rows[0].name).toBe("Durban Poison");
    expect(await productList([w.store.id], { q: "Durban" }, 1, 25)).toMatchObject({ close: false, total: 1 });
    expect(await productList([w.store.id], { q: "durbn", status: "ARCHIVED" }, 1, 25)).toMatchObject({ close: false, total: 0 });
    expect((await productList([w.store.id], { q: "nothern lights" }, 1, 25)).rows.map((r) => r.name)).toEqual(["Northern Lights"]);
  });

  it("find a misspelt item on a store's stock list, never one the store doesn't carry", async () => {
    const rows = await stockRows(w.store.id);
    const durbn = await searchStock(rows, "durbn");
    expect(durbn.close).toBe(true);
    expect(durbn.rows.map((r) => r.sku).sort()).toEqual(["DP-35", "DP-PR"]);
    expect(await searchStock(rows, "nothern lights")).toEqual({ rows: [], close: false });
    const pre = await searchStock(rows, "preroll"); // as typed: punctuation doesn't matter
    expect(pre).toMatchObject({ close: false });
    expect(pre.rows.map((r) => r.variantId)).toEqual([preroll]);
    expect((await searchStock(rows, "")).rows).toHaveLength(rows.length);
  });
});
