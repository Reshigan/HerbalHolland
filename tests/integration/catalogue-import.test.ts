// Catalogue import against a real database: one file with new, updated, unchanged and error rows; products, variants
// and prices written by SKU; opening stock received at the DC through the inventory service; one audit entry with the
// counts; and a file that imports once.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ImportError, previewImport, runImport } from "@/server/hq/catalogue-import";
import { planDigest } from "@/lib/catalogue-import";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let hq: { id: string; name: string };
const actor = () => ({ type: "USER" as const, id: hq.id, name: hq.name });
const upload = (fileName = "catalogue.csv") => db.upload.create({ data: { key: `imports/catalogue/test/${fileName}`, fileName, contentType: "text/csv", sizeBytes: 1, sha256: "test", uploadedById: hq.id } });

const HEAD = "sku,product,variant,category,class,rrp_incl_vat,wholesale_excl_vat,cost_excl_vat,description,thc_max_pct,cbd_mg_per_pack,cbd_mg_per_day,ingredients,allergens,barcode,stock,batch,expires";
const DESC = "Broad-spectrum hemp extract in MCT oil for the end of a long day.";
const ING = '"MCT oil (from coconut), broad-spectrum hemp extract, chamomile extract"';
const FILE = [
  HEAD,
  `EVE-30,Evening Oil 300mg,30 ml,CBD Wellness,CBD,399.00,180.00,99.50,${DESC},0.001,300,10,${ING},none,6009876543210,40,EVE-2609,2027-09-30`,
  "EVE-10,Evening Oil 300mg,10 ml,CBD Wellness,CBD,149.50,68.00,37.25,,,,,,,,20,,",
  `WEL-T-30,Calm Oil,30ml,CBD Wellness,CBD,619.00,280.00,170.00,Our everyday oil: 20 mg of broad-spectrum CBD a day.,,,,${ING},none,,,,`,
  "COF-T-250,Test CBD Coffee,250g,Coffee & drinks,CBD_FOOD,229,110,65,,,,,,,,,,",
  `TINC-30,Evening Tincture,30 ml,Tinctures,CBD,299,140,80,${DESC},0.001,300,10,${ING},none,,,,`,
  `STRONG-30,Strong Oil 1000mg,30 ml,CBD Wellness,CBD,899,400,250,${DESC},0.001,1000,20,${ING},none,,,,`,
].join("\n");

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  hq = await db.user.create({ data: { name: "Hana HQ", role: "HQ_STAFF", email: "hana.hq@example.co.za" } });
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await db.$disconnect();
});

describe("catalogue import", () => {
  it("previews without writing, then imports: creates and updates by SKU, skips error rows, posts opening stock", async () => {
    const products = await db.product.count();
    const { plan, location } = await previewImport(FILE, w.dc.id);
    expect(location?.code).toBe("DC-T");
    expect(plan.rows.map((r) => [r.sku, r.action])).toEqual([
      ["EVE-30", "create"], ["EVE-10", "create"], ["WEL-T-30", "update"], ["COF-T-250", "unchanged"], ["TINC-30", "error"], ["STRONG-30", "error"],
    ]);
    expect(plan.rows[4].errors[0]).toMatch(/^Unknown category “Tinctures”/);
    expect(plan.rows[5].errors).toContain("Schedule 0 allows at most 600 mg CBD per sales pack");
    expect(await db.product.count()).toBe(products); // a dry run

    const file = await upload();
    const { counts } = await runImport({ uploadId: file.id, fileName: file.fileName, sha256: file.sha256, text: FILE, locationId: w.dc.id, digest: planDigest(plan.counts), actor: actor(), userId: hq.id });
    expect(counts).toMatchObject({ create: 2, update: 1, unchanged: 1, errors: 2, productsNew: 1, productsUpdated: 1, variantsNew: 2, variantsUpdated: 1, prices: 1, stockLines: 2, stockUnits: 60 });

    // The new product and its variants: draft, the class's legal basis, prices in cents.
    const eve = await db.product.findUniqueOrThrow({ where: { slug: "evening-oil-300mg" }, include: { variants: { orderBy: { sortOrder: "asc" } }, category: true } });
    expect(eve).toMatchObject({ name: "Evening Oil 300mg", status: "DRAFT", regClass: "CBD", cbdMgPerPack: 300, cbdMgPerDay: 10, thcMax: 0.001, allergens: ["none"], legalBasis: "Schedule 0 CBD: GN 586 of 22 May 2020" });
    expect(eve.category.slug).toBe("wellness");
    expect(eve.variants.map((v) => [v.sku, v.name, v.priceCents, v.wholesaleCents, v.costCents, v.barcode, v.active])).toEqual([
      ["EVE-30", "30 ml", 39_900, 18_000, 9_950, "6009876543210", true],
      ["EVE-10", "10 ml", 14_950, 6_800, 3_725, null, true],
    ]);

    // The update: RRP, wholesale and cost, and the product's facts; the unchanged row and the error rows untouched.
    const oil = await db.variant.findUniqueOrThrow({ where: { sku: "WEL-T-30" }, include: { product: true } });
    expect([oil.priceCents, oil.wholesaleCents, oil.costCents]).toEqual([61_900, 28_000, 17_000]);
    expect(oil.product).toMatchObject({ description: "Our everyday oil: 20 mg of broad-spectrum CBD a day.", allergens: ["none"], cbdMgPerPack: 600, status: "ACTIVE" });
    expect((await db.variant.findUniqueOrThrow({ where: { sku: "COF-T-250" } })).priceCents).toBe(22_900);
    expect(await db.variant.count({ where: { sku: { in: ["TINC-30", "STRONG-30"] } } })).toBe(0);
    expect(await db.category.count({ where: { name: "Tinctures" } })).toBe(0);

    // Opening stock: a released batch per SKU, received at the DC at HQ cost, reason Correction, the file in the note.
    const lots = await db.stockLevel.findMany({ where: { storeId: w.dc.id, variant: { productId: eve.id } }, include: { batch: true, variant: true }, orderBy: { onHand: "desc" } });
    expect(lots.map((l) => [l.variant.sku, l.batch.code, l.onHand, l.unitCostCents, l.batch.status, l.batch.supplier])).toEqual([
      ["EVE-30", "EVE-2609", 40, 9_950, "RELEASED", "Opening stock"],
      ["EVE-10", "EVE-10-OPEN", 20, 3_725, "RELEASED", "Opening stock"],
    ]);
    expect(lots[0].batch.expiresAt?.toISOString()).toBe("2027-09-29T22:00:00.000Z"); // 30 Sep 2027, 00:00 SAST
    const moves = await db.stockMovement.findMany({ where: { variant: { productId: eve.id } } });
    expect(moves.map((m) => [m.type, m.reason, m.qty, m.userId, m.note])).toEqual(expect.arrayContaining([["RECEIVE", "CORRECTION", 40, hq.id, "Opening stock · catalogue.csv"], ["RECEIVE", "CORRECTION", 20, hq.id, "Opening stock · catalogue.csv"]]));
    expect(await db.stockLevel.count({ where: { storeId: w.store.id, variant: { productId: eve.id } } })).toBe(0);

    // One audit entry for the whole import, with the counts.
    const logs = await db.auditLog.findMany({ where: { action: "catalogue.import" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorName: "Hana HQ", entity: "Upload", entityId: file.id, storeId: w.dc.id });
    expect(logs[0].data).toMatchObject({
      file: "catalogue.csv", rows: 6, created: { products: 1, variants: 2 }, updated: { products: 1, variants: 1 }, unchanged: 1, skipped: 2, complianceChanges: 1, priceChanges: 1,
      stock: { location: "DC-T", lines: 2, units: 60, valueCents: 40 * 9_950 + 20 * 3_725 },
      prices: [{ sku: "WEL-T-30", before: [59_500, 28_000, 17_000], after: [61_900, 28_000, 17_000] }],
    });
  });

  it("imports a file once, refuses a stale preview, and has nothing to do for an unchanged file", async () => {
    const file = await db.upload.findFirstOrThrow({ where: { fileName: "catalogue.csv" } });
    await expect(runImport({ uploadId: file.id, fileName: file.fileName, sha256: file.sha256, text: FILE, locationId: w.dc.id, digest: null, actor: actor(), userId: hq.id })).rejects.toThrow(/was imported on/);

    const again = await upload("again.csv");
    const { plan } = await previewImport(FILE, w.dc.id); // now: two rows unchanged, stock again on the two new SKUs
    expect(plan.rows.map((r) => r.action)).toEqual(["unchanged", "unchanged", "unchanged", "unchanged", "error", "error"]);
    await expect(runImport({ uploadId: again.id, fileName: again.fileName, sha256: again.sha256, text: FILE, locationId: w.dc.id, digest: "2-1-1-2-1-1-60", actor: actor(), userId: hq.id })).rejects.toThrow(ImportError);
    const prices = FILE.split("\n").slice(0, 5).map((l) => l.split(",").slice(0, 8).join(",")).join("\n"); // no stock column
    await expect(runImport({ uploadId: again.id, fileName: again.fileName, sha256: again.sha256, text: prices, locationId: null, digest: null, actor: actor(), userId: hq.id })).rejects.toThrow(/Nothing to import/);
    expect(await db.auditLog.count({ where: { action: "catalogue.import" } })).toBe(1);
    expect(await db.stockLevel.aggregate({ where: { storeId: w.dc.id, variant: { sku: { in: ["EVE-30", "EVE-10"] } } }, _sum: { onHand: true } })).toEqual({ _sum: { onHand: 60 } });
  });

  it("holds licensed products' stock back from a location without the licence", async () => {
    const shop = await db.store.create({ data: { code: "TST02", slug: "tst02", name: "Unlicensed Store", companyId: w.owner.id, regionId: w.region.id, addressLine: "2 Burnett St", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083" } });
    const text = [HEAD.split(",").slice(0, 9).concat("stock").join(","), "FLW-T-35,Test Haze,3.5g,Flower,THC,650,290,160,,5"].join("\n");
    const { plan } = await previewImport(text, shop.id);
    expect(plan.rows[0].errors).toEqual(["stock: Licensed (THC) can only be held under a licence, and Unlicensed Store doesn't hold one"]);
  });
});
