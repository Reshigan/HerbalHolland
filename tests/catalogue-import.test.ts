// Catalogue import: the CSV reader (comma or semicolon, quotes, spreadsheet number formats), the cell rules (rand to
// cents, classes, dates, barcodes), and the dry run against a catalogue snapshot — create or update by SKU, the
// product rules (validateProduct, screenCopy), categories matched by name and never created, and opening stock.
import { describe, expect, it } from "vitest";
import {
  IMPORT_COLUMNS, IMPORT_MAX_ROWS, importKeys, importTemplate, parseCsv, planDigest, planImport, readBool, readDate, readImport, readNumber, readRand,
  type ExistingProduct, type ExistingVariant, type ImportSnapshot,
} from "@/lib/catalogue-import";

const HEAD = "sku,product,variant,category,class,rrp_incl_vat,wholesale_excl_vat,cost_excl_vat";
const OIL = "MCT oil (from coconut), broad-spectrum hemp extract (300 mg CBD), peppermint oil";
const csv = (header: string, ...rows: string[]) => [header, ...rows].join("\r\n");
const oilRow = (sku = "OIL-300-30", extra = "") =>
  `${sku},Calm Oil 300mg,30 ml,CBD Wellness,CBD,349.00,160.00,95.00,A peppermint oil with broad-spectrum hemp extract for the evening.,0.001,300,10,"${OIL}",none${extra}`;
const OIL_HEAD = `${HEAD},description,thc_max_pct,cbd_mg_per_pack,cbd_mg_per_day,ingredients,allergens`;

const existingOil: ExistingProduct = {
  id: "p-oil", slug: "rest-oil", variantCount: 1, name: "Rest Oil", categoryId: "c-well", regClass: "CBD", description: "Chamomile and CBD for the wind-down, in MCT oil.", status: "ACTIVE",
  tagline: null, brand: "Herbal Holland", line: "HOUSE", strain: null, thcMin: null, thcMax: 0.001, cbdMin: null, cbdMax: null, effects: ["rest"], flavours: [], lineage: null, origin: null,
  heritage: false, featured: false, tobaccoRelated: false, legalBasis: "Schedule 0 CBD — GN 586 of 22 May 2020", cbdMgPerPack: 300, cbdMgPerDay: 10, claims: [],
  netContent: null, netUnit: null, ingredients: "MCT oil, hemp extract", allergens: ["none"], naturalCbd: false,
};
const existingVariant: ExistingVariant = { id: "v-rest", productId: "p-oil", sku: "REST-30", name: "30 ml", barcode: "6001234000017", grams: null, priceCents: 29_900, wholesaleCents: 14_000, costCents: 8_000, podSku: null, active: true, caseQty: 1 };
const snap = (over: Partial<ImportSnapshot> = {}): ImportSnapshot => ({
  categories: [{ id: "c-well", name: "CBD Wellness", slug: "wellness" }, { id: "c-acc", name: "Accessories", slug: "accessories" }, { id: "c-flower", name: "Flower", slug: "flower" }],
  products: [existingOil],
  variants: [existingVariant],
  barcodes: [{ barcode: "6001234000017", sku: "REST-30" }],
  batches: [],
  location: { id: "dc", code: "DC-GP", name: "Midrand Distribution Centre", kind: "WAREHOUSE", licences: [] },
  licensedOnly: ["THC"],
  today: "2026-09-28",
  ...over,
});
const plan = (text: string, over?: Partial<ImportSnapshot>) => planImport(readImport(text), snap(over));
const row = (p: ReturnType<typeof plan>, line: number) => p.rows.find((r) => r.line === line)!;

describe("numbers and money as spreadsheets write them", () => {
  it("reads either decimal mark, thousands separators and spaces", () => {
    expect(readNumber("1234.5")).toBe(1234.5);
    expect(readNumber("0,001")).toBe(0.001);
    expect(readNumber("1 234,50")).toBe(1234.5);
    expect(readNumber("1,234.50")).toBe(1234.5);
    expect(readNumber("1.234,50")).toBe(1234.5);
    expect(readNumber("1,234,567")).toBe(1234567);
    expect(readNumber("12%")).toBe(12);
    for (const bad of ["abc", "-5", "1e3", "12.", "1,2,3", ""]) expect(() => readNumber(bad), bad).toThrow();
  });
  it("refuses a lone separator before three digits: 1,234 could be either", () => {
    expect(() => readNumber("1,234")).toThrow(/two ways/);
    expect(() => readNumber("1.500")).toThrow(/two ways/);
    expect(readNumber("0.125")).toBe(0.125); // no thousands start with 0
  });
  it("turns rand into integer cents, at most two decimals", () => {
    expect(readRand("349")).toBe(34_900);
    expect(readRand("349,50")).toBe(34_950);
    expect(readRand("R 1 234.50")).toBe(123_450);
    expect(readRand("R1,234.99")).toBe(123_499);
    expect(readRand("ZAR 99.9")).toBe(9_990);
    expect(readRand("0")).toBe(0);
    expect(() => readRand("12.345")).toThrow();
    expect(() => readRand("0.125")).toThrow(/two decimals/);
    expect(() => readRand("19.999")).toThrow(/two ways/);
    expect(() => readRand("2000000")).toThrow(/R1,000,000/);
  });
  it("reads yes/no and dates, day first", () => {
    expect([readBool("Yes"), readBool("n"), readBool("TRUE"), readBool("0")]).toEqual([true, false, true, false]);
    expect(() => readBool("maybe")).toThrow();
    expect(readDate("2027-03-31")).toBe("2027-03-31");
    expect(readDate("2027/3/1")).toBe("2027-03-01");
    expect(readDate("31/03/2027")).toBe("2027-03-31");
    expect(() => readDate("2027-02-30")).toThrow(/real date/);
    expect(() => readDate("03-31-27")).toThrow();
  });
});

describe("reading the CSV", () => {
  it("parses quotes, doubled quotes, line breaks in cells, CRLF and a BOM", () => {
    const { rows, delimiter } = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n1,,3\n');
    expect(delimiter).toBe(",");
    expect(rows).toEqual([["a", "b", "c"], ["x, y", 'say "hi"', "two\nlines"], ["1", "", "3"]]);
    expect(parseCsv('a,b\n"open,1').error).toMatch(/never closed/);
  });
  it("takes semicolons when the header uses them (South African Excel), with comma decimals", () => {
    const text = csv(HEAD.replaceAll(",", ";"), "JAR-250;Stash Jar;250 ml;Accessories;ACCESSORY;189,00;85,00;45,00");
    const read = readImport(text);
    expect(read.delimiter).toBe(";");
    expect(read.records[0].variant).toMatchObject({ sku: "JAR-250", priceCents: 18_900, wholesaleCents: 8_500, costCents: 4_500 });
    expect(parseCsv("sep=;\na;b\n1;2").rows).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("matches headers loosely and by alias, and says which columns it ignored", () => {
    const read = readImport(csv("SKU,Product,Size,Category,Class,RRP (incl. VAT),Wholesale,Cost,Colour", "JAR-250,Stash Jar,250 ml,Accessories,Accessory,189,85,45,Green"));
    expect(read.fileErrors).toEqual([]);
    expect(read.warnings).toEqual(["Ignored column not in the template: Colour."]);
    expect(read.records[0]).toMatchObject({ product: { name: "Stash Jar", category: "Accessories", regClass: "ACCESSORY" }, variant: { name: "250 ml", priceCents: 18_900 } });
  });
  it("needs the required columns, once each, and at least one row", () => {
    expect(readImport("sku,product\nA-1,Jar").fileErrors).toEqual(["Missing required columns: variant, category, class, rrp_incl_vat, wholesale_excl_vat, cost_excl_vat. Start from the template."]);
    expect(readImport(`${HEAD},sku`).fileErrors).toContain("The sku column appears twice.");
    expect(readImport(HEAD).fileErrors).toEqual(["There are no rows under the header."]);
    expect(readImport(" \n ").fileErrors).toEqual(["The file is empty. Start from the template."]);
    const many = csv(HEAD, ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `J-${i},Jar,One,Accessories,ACCESSORY,1,1,1`));
    expect(readImport(many).fileErrors[0]).toMatch(/at most 5,000/);
  });
  it("reports each row's missing and malformed cells, by column, and skips blank rows", () => {
    const read = readImport(csv(`${HEAD},barcode,expires`, "x,Jar,,Nope,Food,R12.345,,5,6.00123E+12,2027-02-30", ",,,,,,,,,", "JAR-1,Jar,One,Accessories,ACCESSORY,10,5,2,,"));
    expect(read.records).toHaveLength(2);
    expect(read.records[1].line).toBe(4);
    expect([...read.records[0].errors, ...read.records[0].productErrors]).toEqual([
      "sku: letters, digits and dashes, 3–32 characters",
      "variant is required",
      "rrp_incl_vat: “12.345” can be read two ways: leave out the thousands separator, e.g. 1234 or 1.25",
      "wholesale_excl_vat is required",
      "barcode: the spreadsheet turned it into a number (6.00123E+12): format the column as text and type the barcode again",
      "expires: not a real date",
      `class: not one of the choices (${IMPORT_COLUMNS.find((c) => c.key === "class")!.about})`,
    ]);
  });
});

describe("the dry run", () => {
  it("creates a product with its variants: prices in cents, draft by default, the class's legal basis", () => {
    const p = plan(csv(`${HEAD},description,status,tobacco_related`, "JAR-250,Stash Jar,250 ml,Accessories,ACCESSORY,189.00,85.00,45.00,An airtight glass jar with a bamboo lid.,,no", "JAR-500,Stash Jar,500 ml,Accessories,ACCESSORY,249.00,112.00,60.00,,,"));
    expect(p.fileErrors).toEqual([]);
    expect(p.rows.map((r) => r.action)).toEqual(["create", "create"]);
    expect(p.rows[0].notes[0]).toBe("New product in Accessories · Accessory · Draft");
    expect(p.products).toHaveLength(1);
    expect(p.products[0]).toMatchObject({ id: null, slug: "stash-jar", data: { name: "Stash Jar", categoryId: "c-acc", status: "DRAFT", brand: "Herbal Holland", legalBasis: null, tobaccoRelated: false } });
    expect(p.variants.map((v) => [v.data.sku, v.data.priceCents, v.data.wholesaleCents, v.data.costCents, v.sortOrder])).toEqual([["JAR-250", 18_900, 8_500, 4_500, 0], ["JAR-500", 24_900, 11_200, 6_000, 1]]);
    expect(p.counts).toMatchObject({ create: 2, productsNew: 1, variantsNew: 2, errors: 0 });
  });

  it("checks each class's rules with validateProduct and screens the copy", () => {
    const p = plan(csv(OIL_HEAD, oilRow(), oilRow("OIL-900-30").replace("Calm Oil 300mg", "Calm Oil 900mg").replace(",300,10,", ",900,10,"), oilRow("OIL-CURE").replace("Calm Oil 300mg", "Cure Oil").replace("for the evening", "that cures insomnia")));
    expect(row(p, 2).action).toBe("create");
    expect(p.products[0].data).toMatchObject({ regClass: "CBD", cbdMgPerPack: 300, cbdMgPerDay: 10, allergens: ["none"], legalBasis: "Schedule 0 CBD — GN 586 of 22 May 2020" });
    expect(row(p, 3).errors).toContain("Schedule 0 allows at most 600 mg CBD per sales pack");
    expect(row(p, 4).errors.some((e) => e.includes("Medicinal claim"))).toBe(true);
    expect(p.products).toHaveLength(1);
  });

  it("reads the case pack (case_qty, aliases case / case_pack): default 1 for a new SKU, kept on an update, 0 refused", () => {
    const p = plan(csv(`${HEAD},description,case_qty`, "JAR-250,Stash Jar,250 ml,Accessories,ACCESSORY,189,85,45,An airtight glass jar with a bamboo lid for the shelf.,6", "JAR-500,Stash Jar,500 ml,Accessories,ACCESSORY,249,112,60,,"));
    expect(p.variants.map((v) => [v.data.sku, v.data.caseQty])).toEqual([["JAR-250", 6], ["JAR-500", 1]]);
    const alias = plan(csv(`${HEAD},description,Case pack`, "JAR-250,Stash Jar,250 ml,Accessories,ACCESSORY,189,85,45,An airtight glass jar with a bamboo lid for the shelf.,12"));
    expect(alias.variants[0].data.caseQty).toBe(12);
    const kept = plan(csv(HEAD, "REST-30,Rest Oil,30 ml,CBD Wellness,CBD,299.00,140.00,80.00"));
    expect(kept.rows[0].action).toBe("unchanged");
    expect(kept.variants[0].data.caseQty).toBe(1);
    const changed = plan(csv(`${HEAD},case`, "REST-30,Rest Oil,30 ml,CBD Wellness,CBD,299.00,140.00,80.00,24"));
    expect(changed.rows[0]).toMatchObject({ action: "update", notes: ["Changes case_qty"] });
    expect(changed.variants[0]).toMatchObject({ changed: ["caseQty"], data: { caseQty: 24 } });
    const zero = plan(csv(`${HEAD},case_qty`, "JAR-250,Stash Jar,250 ml,Accessories,ACCESSORY,189,85,45,0"));
    expect(row(zero, 2).errors).toContain("case_qty: at least 1 (leave it empty for single units)");
    expect(row(plan(csv(`${HEAD},case_qty`, "JAR-250,Stash Jar,250 ml,Accessories,ACCESSORY,189,85,45,1.5")), 2).errors).toContain("case_qty: a whole number");
  });

  it("needs the facts a class carries: CBD food without its net content or natural-CBD tick is an error", () => {
    const p = plan(csv(`${HEAD},description,cbd_mg_per_pack,thc_max_pct,ingredients,allergens`, "COF-250,Hemp Coffee,250 g,CBD Wellness,CBD_FOOD,229,110,65,Arabica coffee with South African hemp in the blend.,15,0.001,Arabica coffee,none"));
    expect(row(p, 2).errors).toEqual(expect.arrayContaining(["CBD food & drink may only hold the CBD naturally in its ingredients: tick to confirm none is added", "Net content is required (g or ml): the CBD limit is worked out from it"]));
  });

  it("matches categories by name, never creating one", () => {
    const p = plan(csv(HEAD, "GRD-1,Brass Grinder,One size,accessories,ACCESSORY,299,140,80", "TENT-1,Grow Tent,One size,Grow tents,GROW,2999,1400,800"));
    expect(row(p, 2).errors).toContain("description: at least a sentence (20 characters or more) — it appears on the product page");
    expect(row(p, 3).errors).toContain("Unknown category “Grow tents”: add it in HQ → Catalogue → Categories first (the import never creates categories)");
    expect(p.products).toEqual([]);
  });

  it("updates by SKU: prices and product details, with what changes spelled out; unchanged rows stay unchanged", () => {
    const text = csv(`${HEAD},description,status`, "REST-30,Rest Oil,30 ml,CBD Wellness,CBD,319.00,140.00,80.00,,,");
    const p = plan(text);
    expect(row(p, 2)).toMatchObject({ action: "update", notes: ["RRP R299.00 → R319.00"] });
    expect(p.variants[0]).toMatchObject({ id: "v-rest", productId: "p-oil", changed: ["priceCents"], before: [29_900, 14_000, 8_000] });
    expect(p.products).toEqual([]);
    expect(p.counts).toMatchObject({ update: 1, variantsUpdated: 1, prices: 1, productsUpdated: 0 });

    const same = plan(csv(HEAD, "REST-30,Rest Oil,30 ml,CBD Wellness,CBD,299,140,80"));
    expect(same.rows[0].action).toBe("unchanged");
    expect(same.variants[0].changed).toEqual([]);

    const draft = plan(csv(`${HEAD},status,cbd_mg_per_pack`, "REST-30,Rest Oil,30 ml,CBD Wellness,CBD,299,140,80,DRAFT,200"));
    expect(draft.rows[0]).toMatchObject({ action: "update", notes: ["Product: status Active → Draft, cbd_mg_per_pack"] });
    expect(draft.products[0]).toMatchObject({ id: "p-oil", slug: "rest-oil", changed: ["status", "cbdMgPerPack"], compliance: true });
    expect(draft.counts).toMatchObject({ productsUpdated: 1, compliance: 1 });
  });

  it("adds a new SKU to the product with that name", () => {
    const p = plan(csv(HEAD, "REST-10,Rest Oil,10 ml,CBD Wellness,CBD,129,60,35"));
    expect(row(p, 2).action).toBe("create");
    expect(p.variants[0]).toMatchObject({ productId: "p-oil", id: null, sortOrder: 1 });
    expect(p.products).toEqual([]);
  });

  it("keeps a product's details the same on each of its rows", () => {
    const p = plan(csv(`${HEAD},description`, "JAR-250,Stash Jar,250 ml,Accessories,ACCESSORY,189,85,45,An airtight glass jar with a bamboo lid.", "JAR-500,Stash Jar,500 ml,Flower,ACCESSORY,249,112,60,", "JAR-1L,Stash Jar,1 litre,ACCESSORIES,accessory,299,135,72,"));
    expect(row(p, 2).action).toBe("create");
    expect(row(p, 3).errors).toEqual(["category doesn't match row 2: a product's details are the same on each of its rows (or empty after the first)"]);
    expect(row(p, 4).action).toBe("create"); // the same category and class, however they're written
    expect(p.variants.map((v) => v.data.sku)).toEqual(["JAR-250", "JAR-1L"]);
  });

  it("holds back a product whose details have an error on any of its rows", () => {
    const p = plan(csv(`${HEAD},description,tagline`, `JAR-250,Stash Jar,250 ml,Accessories,ACCESSORY,189,85,45,An airtight glass jar with a bamboo lid.,${"x".repeat(141)}`, "JAR-500,Stash Jar,500 ml,Accessories,ACCESSORY,249,112,60,,"));
    expect(row(p, 2).errors).toEqual(["tagline: at most 140 characters"]);
    expect(row(p, 3).errors).toEqual(["The product's details on row 2 need fixing first"]);
    expect([p.products, p.variants]).toEqual([[], []]);
  });

  it("refuses duplicate SKUs and barcodes, a barcode on another SKU, and the template's example rows", () => {
    const p = plan(csv(`${HEAD},barcode`, "JAR-1,Jar,One,Accessories,ACCESSORY,10,5,2,6001234000024", "JAR-1,Jar,Two,Accessories,ACCESSORY,10,5,2,6001234000024", "JAR-2,Jar,Three,Accessories,ACCESSORY,10,5,2,6001234000017", "EXAMPLE-JAR,Jar,Four,Accessories,ACCESSORY,10,5,2,"));
    expect(row(p, 3).errors).toEqual(expect.arrayContaining(["SKU JAR-1 is also on row 2", "barcode: 6001234000024 is also on row 2"]));
    expect(row(p, 4).errors).toContain("barcode: 6001234000017 is already on SKU REST-30");
    expect(row(p, 5).errors).toContain("An example row from the template: replace it with your own product, or delete it");
    expect(p.counts.errors).toBe(4); // JAR-1 lacks a description, so row 2 is held back too
  });

  it("won't move a SKU between products", () => {
    const p = plan(csv(HEAD, "REST-30,Calm Oil,30 ml,CBD Wellness,CBD,299,140,80"), {
      products: [existingOil, { ...existingOil, id: "p-calm", slug: "calm-oil", name: "Calm Oil" }],
    });
    // REST-30 belongs to Rest Oil: named "Calm Oil" here, it renames Rest Oil (its slug stays) rather than moving.
    expect(row(p, 2).notes[0]).toBe("Product: renamed from “Rest Oil”");
    expect(p.products[0]).toMatchObject({ id: "p-oil", slug: "rest-oil", data: { name: "Calm Oil" } });
    const two = plan(csv(HEAD, "REST-30,Calm Oil,30 ml,CBD Wellness,CBD,299,140,80", "CALM-30,Calm Oil,30 ml,CBD Wellness,CBD,299,140,80"), {
      products: [existingOil, { ...existingOil, id: "p-calm", slug: "calm-oil", name: "Calm Oil" }],
      variants: [existingVariant, { ...existingVariant, id: "v-calm", productId: "p-calm", sku: "CALM-30", barcode: null }],
    });
    expect(two.rows.every((r) => r.errors[0]?.startsWith("These SKUs belong to different products (“Rest Oil”, “Calm Oil”)"))).toBe(true);
  });
});

describe("opening stock", () => {
  const STOCK = `${HEAD},description,merch_partner_code,stock,batch,expires`;
  const jar = (sku: string, stock: string, batch = "", expires = "", pod = "") => `${sku},Stash Jar,${sku},Accessories,ACCESSORY,189,85,45,An airtight glass jar with a bamboo lid.,${pod},${stock},${batch},${expires}`;

  it("needs a location, and goes in at HQ cost at a warehouse or at wholesale at a store", () => {
    expect(plan(csv(STOCK, jar("JAR-1", "12")), { location: null }).fileErrors).toEqual(["Some rows have opening stock: choose where it is — a warehouse or a store — or clear the stock column."]);
    const dc = plan(csv(STOCK, jar("JAR-1", "12", "LOT-7", "2027-06-30"), jar("JAR-2", "0")));
    expect(dc.stock).toEqual([{ line: 2, sku: "JAR-1", qty: 12, batchCode: "LOT-7", batchId: null, expires: "2027-06-30", unitCostCents: 4_500 }]);
    expect(row(dc, 2).notes).toContain("Opening stock: 12 at Midrand Distribution Centre · batch LOT-7, expires 2027-06-30");
    expect(dc.counts).toMatchObject({ stockLines: 1, stockUnits: 12, stockValueCents: 54_000 });
    const store = plan(csv(STOCK, jar("JAR-1", "12")), { location: { id: "s", code: "PTA01", name: "Hatfield", kind: "RETAIL", licences: [] } });
    expect(store.stock[0]).toMatchObject({ batchCode: "JAR-1-OPEN", unitCostCents: 8_500 });
  });

  it("refuses stock for made-to-order merch, expired batches, a batch on another SKU, and licensed products where there's no licence", () => {
    const p = plan(csv(STOCK, jar("TEE-M", "5", "", "", "HH-TEE-M"), jar("JAR-1", "5", "", "2026-09-28"), jar("JAR-2", "5", "OLD-LOT"), jar("JAR-3", "5", "LOT-1"), jar("JAR-4", "5", "LOT-1")), {
      batches: [{ id: "b-old", code: "OLD-LOT", variantId: "v-rest" }],
    });
    expect(row(p, 2).errors).toEqual(["stock: made to order by the merch partner, so it carries no stock"]);
    expect(row(p, 3).errors).toEqual(["expires: that date has passed — expired stock can't be loaded"]);
    expect(row(p, 4).errors).toEqual(["batch: OLD-LOT belongs to another SKU — use a different code"]);
    expect(row(p, 6).errors).toEqual(["batch: LOT-1 is also used for JAR-3 in this file"]);
    const thc = plan(csv(`${HEAD},description,stock`, "HAZE-35,Test Haze,3.5g,Flower,THC,650,290,160,A bright sativa grown under the Highveld sun.,10"));
    expect(thc.rows[0].errors).toEqual(["stock: Licensed (THC) can only be held under a licence, and Midrand Distribution Centre doesn't hold one"]);
    const licensed = plan(csv(`${HEAD},description,stock`, "HAZE-35,Test Haze,3.5g,Flower,THC,650,290,160,A bright sativa grown under the Highveld sun.,10"), { location: { ...snap().location!, licences: ["THC"] } });
    expect(licensed.rows[0].action).toBe("create");
  });

  it("adds to a batch already on record for the same SKU", () => {
    const p = plan(csv(`${HEAD},stock,batch`, "REST-30,Rest Oil,30 ml,CBD Wellness,CBD,299,140,80,6,REST-A"), { batches: [{ id: "b-rest", code: "REST-A", variantId: "v-rest" }] });
    expect(p.rows[0]).toMatchObject({ action: "unchanged", stock: 6, notes: ["Opening stock: 6 at Midrand Distribution Centre · batch REST-A (already on record)"] });
    expect(p.stock[0]).toMatchObject({ batchId: "b-rest", unitCostCents: 8_000 });
    expect(importKeys(readImport(csv(`${HEAD},stock`, "REST-30,Rest Oil,30 ml,CBD Wellness,CBD,299,140,80,6")))).toEqual({ skus: ["REST-30"], slugs: ["rest-oil"], barcodes: [], batches: ["REST-30-OPEN"] });
  });

  it("summarises the plan in a digest the import checks against", () => {
    const p = plan(csv(STOCK, jar("JAR-1", "12"), jar("EXAMPLE-X", "1")));
    expect(planDigest(p.counts)).toBe("1-0-0-1-1-0-12");
  });
});

describe("the template", () => {
  it("has every column once, in the reference order", () => {
    const [head] = parseCsv(importTemplate()).rows;
    expect(head).toEqual(IMPORT_COLUMNS.map((c) => c.key));
    expect(new Set(head).size).toBe(head.length);
    expect(IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key)).toEqual(HEAD.split(","));
  });
  it("its example rows are refused as they are, and import cleanly once they're your own", () => {
    const template = importTemplate();
    const asIs = plan(template);
    expect(asIs.rows.map((r) => r.action)).toEqual(["error", "error", "error"]);
    const own = plan(template.replaceAll("EXAMPLE-", "HH-"));
    expect(own.rows.flatMap((r) => r.errors)).toEqual([]);
    expect(own.counts).toMatchObject({ create: 3, productsNew: 2, variantsNew: 3, stockUnits: 48 });
    expect(own.products.find((p) => p.slug === "example-calm-oil-300mg")?.data).toMatchObject({ regClass: "CBD", cbdMgPerPack: 300, cbdMgPerDay: 10, claims: ["Supports everyday calm"], effects: ["calm", "focus"] });
  });
});

describe("oversized files", () => {
  it("stops at a row with more cells than any catalogue has", () => {
    const r = parseCsv(`sku,name\n${",".repeat(5_000)}\n`);
    expect(r.error).toMatch(/more than 100 cells/);
  });
});
