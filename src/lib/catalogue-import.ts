// Catalogue import (HQ → Catalogue → Import): a spreadsheet saved as CSV, one row per SKU, read and checked in pure code,
// then planned against the catalogue (create or update by SKU) so HQ sees a dry run before anything is written.
// It keeps the product form's rules: validateProduct() for each class's limits and facts, screenCopy() for the copy,
// prices in rand to integer cents (RRP incl. VAT; wholesale and cost excl. VAT) and categories matched by name, never
// created. Optional opening stock lands at one location (a warehouse or a store), in a batch per SKU.
import { ALLERGENS, ALLERGEN_KEYS, CBD_CLASSES, DEFAULT_LEGAL_BASIS, PRODUCT_FACTS, REG_CLASSES, REG_CLASS_LABEL, complianceChange, screenCopy, validateProduct, type RegClass } from "./compliance";
import { toCsv } from "./csv";
import { num, slugify } from "./format";
import { zar } from "./money";

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5_000;
export const IMPORT_MAX_COLUMNS = 100; // the template has fewer than 40: more means the wrong delimiter, or not a catalogue
export const IMPORT_MAX_IMAGES = 6;
export const PRODUCT_LINES = ["HOUSE", "HERITAGE", "CLASSIC", "RESERVE", "PARTNER"] as const;
const STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"] as const;
const STRAINS = ["INDICA", "SATIVA", "HYBRID", "CBD"] as const;

export type ProductData = {
  name: string; categoryId: string; regClass: RegClass; description: string; status: (typeof STATUSES)[number];
  tagline: string | null; brand: string; line: string | null; strain: (typeof STRAINS)[number] | null;
  thcMin: number | null; thcMax: number | null; cbdMin: number | null; cbdMax: number | null;
  effects: string[]; flavours: string[]; lineage: string | null; origin: string | null; heritage: boolean; featured: boolean; tobaccoRelated: boolean;
  legalBasis: string | null; cbdMgPerPack: number | null; cbdMgPerDay: number | null; claims: string[];
  netContent: number | null; netUnit: string | null; ingredients: string | null; allergens: string[]; naturalCbd: boolean;
};
export type VariantData = { sku: string; name: string; barcode: string | null; grams: number | null; priceCents: number; wholesaleCents: number; costCents: number; podSku: string | null; active: boolean; caseQty: number };
type Value = string | number | boolean | string[];

// ── Cells ─────────────────────────────────────────────────────────────────────
export class CellError extends Error {}
const bad = (message: string): never => {
  throw new CellError(message);
};

/**
 * A number as spreadsheets write it: "1234.5", "1 234,50", "1,234.50", "1.234,50", "0,001". Either mark can be the
 * decimal point; a lone one followed by exactly three digits ("1,234", "1.500") could be either, so it's refused.
 */
export function readNumber(raw: string): number {
  const s = raw.trim().replace(/[\s  ]/g, "").replace(/%$/, "");
  if (!/^\d+([.,]\d+)*$/.test(s)) bad("not a number");
  const at = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (at < 0) return Number(s);
  const point = s[at], group = point === "." ? "," : ".";
  const whole = s.slice(0, at), frac = s.slice(at + 1);
  if (whole.includes(point)) {
    // "1,234,567": the only mark groups thousands.
    if (s.includes(group) || !/^\d{1,3}([.,]\d{3})+$/.test(s)) bad("not a number");
    return Number(s.replaceAll(point, ""));
  }
  if (whole.includes(group)) {
    if (!/^\d{1,3}([.,]\d{3})+$/.test(whole)) bad("not a number");
    return Number(`${whole.replaceAll(group, "")}.${frac}`);
  }
  if (frac.length === 3 && /^[1-9]\d{0,2}$/.test(whole)) bad(`“${raw.trim()}” can be read two ways: leave out the thousands separator, e.g. 1234 or 1.25`);
  return Number(`${whole}.${frac}`);
}

/** Rand → integer cents: "349", "349.50", "R349,50", "R 1 234.50", "1,234.50". At most two decimals. */
export function readRand(raw: string): number {
  const n = readNumber(raw.trim().replace(/^(zar|r)\s*/i, ""));
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) bad("at most two decimals (cents)");
  if (cents > 100_000_000) bad("more than R1,000,000 — check the amount");
  return cents;
}

export function readBool(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (["yes", "y", "true", "1", "x"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return bad("yes or no");
}

/** "2027-03-31", "2027/03/31" or "31/03/2027" (day first, as South Africa writes it) → "2027-03-31". */
export function readDate(raw: string): string {
  const s = raw.trim();
  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const [y, m, d] = ymd ? [ymd[1], ymd[2], ymd[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : bad("a date like 2027-03-31");
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) bad("not a real date");
  return iso;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** A choice by its code or its label, in any case: "CBD_FOOD", "cbd food", "CBD food & drink". */
function oneOf<T extends string>(values: readonly T[], labels: Partial<Record<T, string>> = {}) {
  const map = new Map<string, T>();
  for (const v of values) map.set(norm(v), v).set(norm(labels[v] ?? v), v);
  return (raw: string) => map.get(norm(raw)) ?? null;
}

// ── Columns ───────────────────────────────────────────────────────────────────
type Kind = "text" | "sku" | "code" | "barcode" | "money" | "num" | "int" | "bool" | "choice" | "list" | "date";
type Column = {
  key: string; // the header, as in the template
  level: "product" | "variant" | "stock";
  field: string; // the ProductData / VariantData field it sets (or category, qty, batch, expires)
  kind: Kind;
  about: string;
  required?: boolean;
  aliases?: string[];
  max?: number; // characters for text and list items, the largest value for numbers
  choose?: (raw: string) => string | null;
  commas?: boolean; // list items may be separated by commas too
};

const COLUMNS: Column[] = [
  // Every row, every time.
  { key: "sku", level: "variant", field: "sku", kind: "sku", required: true, about: "Letters, digits and dashes (3–32). A SKU already in the catalogue is updated; a new one is created" },
  { key: "product", level: "product", field: "name", kind: "text", max: 120, required: true, aliases: ["product_name", "name"], about: "Product name. Rows with the same name are one product, one row per size or option" },
  { key: "variant", level: "variant", field: "name", kind: "text", max: 60, required: true, aliases: ["size", "variant_name", "option"], about: "Size or option, e.g. 30 ml or One size" },
  { key: "category", level: "product", field: "category", kind: "text", max: 60, required: true, about: "An existing category, by name (HQ → Catalogue → Categories). The import never creates one" },
  { key: "class", level: "product", field: "regClass", kind: "choice", choose: oneOf(REG_CLASSES, REG_CLASS_LABEL), required: true, aliases: ["reg_class", "regulatory_class"], about: `Regulatory class: ${REG_CLASSES.join(", ")}` },
  { key: "rrp_incl_vat", level: "variant", field: "priceCents", kind: "money", required: true, aliases: ["rrp", "price", "retail_price"], about: "Recommended retail price in rand, VAT included, e.g. 349.00" },
  { key: "wholesale_excl_vat", level: "variant", field: "wholesaleCents", kind: "money", required: true, aliases: ["wholesale", "wholesale_ex_vat"], about: "Price to stores in rand, VAT excluded" },
  { key: "cost_excl_vat", level: "variant", field: "costCents", kind: "money", required: true, aliases: ["cost", "cost_ex_vat", "landed_cost"], about: "HQ landed cost in rand, VAT excluded" },
  // Product details: as the class requires. An empty cell keeps what the catalogue has.
  { key: "status", level: "product", field: "status", kind: "choice", choose: oneOf(STATUSES), about: "DRAFT, ACTIVE or ARCHIVED. New products start in draft" },
  { key: "description", level: "product", field: "description", kind: "text", max: 5000, about: "Needed for a new product: at least a sentence — it appears on the product page" },
  { key: "tagline", level: "product", field: "tagline", kind: "text", max: 140, about: "One warm line, no medical claims" },
  { key: "brand", level: "product", field: "brand", kind: "text", max: 60, about: "Herbal Holland unless it's a partner's brand" },
  { key: "line", level: "product", field: "line", kind: "choice", choose: oneOf(PRODUCT_LINES), about: PRODUCT_LINES.join(", ") },
  { key: "strain", level: "product", field: "strain", kind: "choice", choose: oneOf(STRAINS), about: `${STRAINS.join(", ")} (plants only)` },
  { key: "thc_min_pct", level: "product", field: "thcMin", kind: "num", max: 100, aliases: ["thc_min"], about: "Typical THC, %" },
  { key: "thc_max_pct", level: "product", field: "thcMax", kind: "num", max: 100, aliases: ["thc_max"], about: "Maximum THC, % (CBD classes: at most 0.001)" },
  { key: "cbd_min_pct", level: "product", field: "cbdMin", kind: "num", max: 100, aliases: ["cbd_min"], about: "Typical CBD, %" },
  { key: "cbd_max_pct", level: "product", field: "cbdMax", kind: "num", max: 100, aliases: ["cbd_max"], about: "Maximum CBD, %" },
  { key: "cbd_mg_per_pack", level: "product", field: "cbdMgPerPack", kind: "int", max: 100_000, about: "CBD in one pack, whole mg (CBD supplements: at most 600)" },
  { key: "cbd_mg_per_day", level: "product", field: "cbdMgPerDay", kind: "num", max: 1_000, about: "CBD supplements: maximum daily dose, mg (at most 20)" },
  { key: "natural_cbd", level: "product", field: "naturalCbd", kind: "bool", about: "CBD food & drink: yes when it holds only the CBD naturally in its ingredients" },
  { key: "net_content", level: "product", field: "netContent", kind: "num", max: 100_000, about: "One pack, as on the label (food, drink, supplements, skin care)" },
  { key: "net_unit", level: "product", field: "netUnit", kind: "choice", choose: oneOf(["g", "ml"]), about: "g or ml" },
  { key: "ingredients", level: "product", field: "ingredients", kind: "text", max: 2000, about: "As on the label, in descending order of weight" },
  { key: "allergens", level: "product", field: "allergens", kind: "list", commas: true, choose: oneOf(ALLERGEN_KEYS, ALLERGENS), about: `R146 allergens, separated by |: ${ALLERGEN_KEYS.join(", ")}` },
  { key: "claims", level: "product", field: "claims", kind: "list", max: 140, about: "Approved low-risk claims, separated by |" },
  { key: "legal_basis", level: "product", field: "legalBasis", kind: "text", max: 200, about: "Defaults to the class's legal basis" },
  { key: "effects", level: "product", field: "effects", kind: "list", commas: true, max: 40, about: "Moods or effects, separated by |, e.g. calm|focus" },
  { key: "flavours", level: "product", field: "flavours", kind: "list", commas: true, max: 40, about: "Separated by |" },
  { key: "lineage", level: "product", field: "lineage", kind: "text", max: 120, about: "Plants: parent strains" },
  { key: "origin", level: "product", field: "origin", kind: "text", max: 120, about: "Where it's from, e.g. Durban, KZN" },
  { key: "heritage", level: "product", field: "heritage", kind: "bool", about: "yes for an African landrace story" },
  { key: "featured", level: "product", field: "featured", kind: "bool", about: "yes to feature it in the shop and the app" },
  { key: "tobacco_related", level: "product", field: "tobaccoRelated", kind: "bool", about: "yes for pipes, water-pipes, papers and vapes (Tobacco Bill)" },
  { key: "image_urls", level: "product", field: "imageUrls", kind: "list", max: 500, aliases: ["images", "photos", "image_url"], about: "Product photos: https:// web addresses separated by |, up to 6 — fetched and kept at import (JPG, PNG or WebP, 5 MB each); the first is the main picture" },
  // Variant details.
  { key: "barcode", level: "variant", field: "barcode", kind: "barcode", aliases: ["ean", "gtin"], about: "EAN or UPC, 8–14 digits (format the column as text)" },
  { key: "grams", level: "variant", field: "grams", kind: "num", max: 1000, about: "Dried-flower equivalent grams, for licensed products' limits" },
  { key: "merch_partner_code", level: "variant", field: "podSku", kind: "text", max: 64, aliases: ["pod_sku"], about: "Made to order: the merch partner's product code (no stock)" },
  { key: "case_qty", level: "variant", field: "caseQty", kind: "int", max: 1000, aliases: ["case", "case_pack", "units_per_case"], about: "Units per case: trade orders are placed in multiples of this (default 1)" },
  { key: "active", level: "variant", field: "active", kind: "bool", about: "no stops it being ordered or sold (new variants: yes)" },
  // Opening stock at the location chosen on upload.
  { key: "stock", level: "stock", field: "qty", kind: "int", max: 1_000_000, aliases: ["opening_stock", "qty", "quantity"], about: "Opening stock, in units, at the location you choose" },
  { key: "batch", level: "stock", field: "batch", kind: "code", aliases: ["batch_code", "lot"], about: "Batch or lot code on the packs (default: the SKU with -OPEN)" },
  { key: "expires", level: "stock", field: "expires", kind: "date", aliases: ["expiry", "expiry_date", "best_before"], about: "The batch's expiry date, e.g. 2027-03-31" },
];

/** The columns, for the reference on the import page and the template. */
export const IMPORT_COLUMNS = COLUMNS.map(({ key, level, about, required }) => ({ key, level, about, required: !!required }));
const HEADER = new Map(COLUMNS.map((c) => [`${c.level}.${c.field}`, c.key]));
const header = (level: Column["level"], field: string) => HEADER.get(`${level}.${field}`) ?? field;

function readCell(c: Column, raw: string): Value {
  const s = raw.trim();
  const within = (n: number) => (c.max != null && n > c.max ? bad(`at most ${num(c.max)}`) : n);
  switch (c.kind) {
    case "sku": {
      const v = s.toUpperCase();
      return /^[A-Z0-9-]{3,32}$/.test(v) ? v : bad("letters, digits and dashes, 3–32 characters");
    }
    case "code": {
      const v = s.toUpperCase();
      return /^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(v) ? v : bad("letters, digits, dots, dashes or slashes, 2–40 characters");
    }
    case "barcode": {
      const v = s.replace(/\s/g, "");
      if (/^\d+([.,]\d+)?e\+?\d+$/i.test(v)) bad(`the spreadsheet turned it into a number (${v}): format the column as text and type the barcode again`);
      return /^\d{8,14}$/.test(v) ? v : bad("8–14 digits (EAN or UPC)");
    }
    case "money":
      return readRand(s);
    case "num":
      return within(readNumber(s));
    case "int": {
      const n = readNumber(s);
      return Number.isInteger(n) ? within(n) : bad("a whole number");
    }
    case "bool":
      return readBool(s);
    case "date":
      return readDate(s);
    case "choice":
      return c.choose!(s) ?? bad(`not one of the choices (${c.about})`);
    case "list": {
      const items = [...new Set(s.split(c.commas ? /[|;,]/ : /[|;]/).map((x) => x.trim()).filter(Boolean))];
      if (c.choose) {
        const unknown = items.filter((x) => !c.choose!(x));
        if (unknown.length) bad(`unknown: ${unknown.join(", ")}`);
        return [...new Set(items.map((x) => c.choose!(x)!))];
      }
      const long = items.find((x) => x.length > (c.max ?? 200));
      return long ? bad(`“${long.slice(0, 40)}…” is longer than ${c.max} characters`) : items;
    }
    default: {
      // Long text keeps its line breaks; everything else is one line.
      const v = (c.max ?? 0) >= 2000 ? s.replace(/\r\n?/g, "\n") : s.replace(/\s+/g, " ");
      return v.length > (c.max ?? 200) ? bad(`at most ${num(c.max ?? 200)} characters`) : v;
    }
  }
}

// ── Reading the file ──────────────────────────────────────────────────────────
/** RFC 4180 rows: comma or semicolon separated (whichever the header line uses), quoted cells, "" escapes, CRLF or LF, BOM. */
export function parseCsv(text: string): { rows: string[][]; delimiter: "," | ";"; error?: string } {
  let src = text.replace(/^﻿/, "");
  let delimiter: "," | ";" = ",";
  const sep = src.match(/^sep=([,;])\r?\n/i); // Excel's hint line
  if (sep) (delimiter = sep[1] as "," | ";"), (src = src.slice(sep[0].length));
  else {
    let quoted = false, commas = 0, semis = 0;
    for (const ch of src) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && (ch === "\n" || ch === "\r")) break;
      else if (!quoted) (commas += +(ch === ",")), (semis += +(ch === ";"));
    }
    if (semis > commas) delimiter = ";";
  }
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') (cell += '"'), i++;
      else quoted = false;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === delimiter) {
      row.push(cell), (cell = "");
      if (row.length > IMPORT_MAX_COLUMNS) return { rows, delimiter, error: `Row ${rows.length + 1} has more than ${IMPORT_MAX_COLUMNS} cells — check the file is the catalogue template, saved as CSV.` };
    }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (quoted) return { rows, delimiter, error: `A quoted cell is never closed — look for a stray " on or after row ${rows.length + 1}.` };
  if (cell || row.length) row.push(cell), rows.push(row);
  return { rows, delimiter };
}

export type ImportRecord = {
  line: number; // the spreadsheet row (the header is row 1)
  product: Record<string, Value>; // ProductData fields, plus the category by name
  variant: Record<string, Value>; // VariantData fields
  stock: Record<string, Value>; // qty, batch, expires
  errors: string[];
  productErrors: string[]; // bad product details: they hold back the whole product
};
export type ImportRead = { records: ImportRecord[]; fileErrors: string[]; warnings: string[]; delimiter: "," | ";" };

/** Reads a CSV into typed rows: file-level problems (columns, size) and each row's own cell errors. */
export function readImport(text: string): ImportRead {
  const { rows, delimiter, error } = parseCsv(text);
  const out: ImportRead = { records: [], fileErrors: error ? [error] : [], warnings: [], delimiter };
  const at = rows.findIndex((r) => r.some((c) => c.trim()));
  if (at < 0) out.fileErrors.push("The file is empty. Start from the template.");
  if (out.fileErrors.length) return out;

  const known = new Map<string, Column>();
  for (const c of COLUMNS) for (const name of [c.key, ...(c.aliases ?? [])]) known.set(name, c);
  const seen = new Set<Column>(), ignored: string[] = [];
  const cols = rows[at].map((h): Column | null => {
    const c = known.get(h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""));
    if (!c) {
      if (h.trim()) ignored.push(h.trim());
      return null;
    }
    if (seen.has(c)) {
      out.fileErrors.push(`The ${c.key} column appears twice.`);
      return null;
    }
    seen.add(c);
    return c;
  });
  const missing = COLUMNS.filter((c) => c.required && !seen.has(c)).map((c) => c.key);
  if (missing.length) out.fileErrors.push(`Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Start from the template.`);
  if (ignored.length) out.warnings.push(`Ignored column${ignored.length === 1 ? "" : "s"} not in the template: ${ignored.join(", ")}.`);
  const body = rows.slice(at + 1).map((cells, i) => ({ cells, line: at + i + 2 })).filter((r) => r.cells.some((c) => c.trim()));
  if (!body.length) out.fileErrors.push("There are no rows under the header.");
  if (body.length > IMPORT_MAX_ROWS) out.fileErrors.push(`The file has ${num(body.length)} rows: import at most ${num(IMPORT_MAX_ROWS)} at a time — split it into smaller files.`);
  if (out.fileErrors.length) return out;

  for (const { cells, line } of body) {
    const r: ImportRecord = { line, product: {}, variant: {}, stock: {}, errors: [], productErrors: [] };
    cols.forEach((c, i) => {
      const raw = cells[i] ?? "";
      if (!c) return;
      if (!raw.trim()) {
        if (c.required) r.errors.push(`${c.key} is required`);
        return;
      }
      try {
        r[c.level][c.field] = readCell(c, raw);
      } catch (e) {
        if (!(e instanceof CellError)) throw e;
        (c.level === "product" ? r.productErrors : r.errors).push(`${c.key}: ${e.message}`);
      }
    });
    out.records.push(r);
  }
  return out;
}

const skuOf = (r: ImportRecord) => r.variant.sku as string | undefined;
const qtyOf = (r: ImportRecord) => (r.stock.qty as number | undefined) ?? 0;
const batchOf = (r: ImportRecord) => (r.stock.batch as string | undefined) ?? `${skuOf(r)}-OPEN`;

/** What the planner needs looked up in the catalogue: the file's SKUs, product slugs, barcodes and batch codes. */
export function importKeys(read: ImportRead) {
  const skus = new Set<string>(), slugs = new Set<string>(), barcodes = new Set<string>(), batches = new Set<string>();
  for (const r of read.records) {
    const sku = skuOf(r), name = r.product.name as string | undefined, barcode = r.variant.barcode as string | undefined;
    if (sku) skus.add(sku);
    if (name && slugify(name)) slugs.add(slugify(name));
    if (barcode) barcodes.add(barcode);
    if (sku && qtyOf(r) > 0) batches.add(batchOf(r));
  }
  return { skus: [...skus], slugs: [...slugs], barcodes: [...barcodes], batches: [...batches] };
}

// ── Planning ──────────────────────────────────────────────────────────────────
export type ImportLocation = { id: string; code: string; name: string; kind: "RETAIL" | "WAREHOUSE"; licences: string[] };
export type ExistingProduct = ProductData & { id: string; slug: string; variantCount: number };
export type ExistingVariant = VariantData & { id: string; productId: string };
/** The slice of the catalogue a file touches (looked up by importKeys), and where opening stock goes. */
export type ImportSnapshot = {
  categories: { id: string; name: string; slug: string }[];
  products: ExistingProduct[];
  variants: ExistingVariant[];
  barcodes: { barcode: string; sku: string }[];
  batches: { id: string; code: string; variantId: string }[];
  location: ImportLocation | null;
  licensedOnly: RegClass[];
  today: string; // YYYY-MM-DD, SAST
};

export type RowAction = "create" | "update" | "unchanged" | "error";
export type PlanRow = { line: number; sku: string; product: string; variant: string; action: RowAction; notes: string[]; errors: string[]; stock: number };
export type ProductWrite = { key: string; id: string | null; slug: string; data: ProductData; changed: string[]; compliance: boolean; images: string[] };
export type VariantWrite = { line: number; productKey: string; productId: string | null; id: string | null; data: VariantData; changed: string[]; before: [number, number, number] | null; sortOrder: number };
export type StockWrite = { line: number; sku: string; qty: number; batchCode: string; batchId: string | null; expires: string | null; unitCostCents: number };
export type ImportCounts = {
  rows: number; create: number; update: number; unchanged: number; errors: number;
  productsNew: number; productsUpdated: number; variantsNew: number; variantsUpdated: number; compliance: number; prices: number;
  stockLines: number; stockUnits: number; stockValueCents: number;
};
export type ImportPlan = { fileErrors: string[]; warnings: string[]; rows: PlanRow[]; products: ProductWrite[]; variants: VariantWrite[]; stock: StockWrite[]; counts: ImportCounts };

const newProduct = (regClass: RegClass): ProductData => ({
  name: "", categoryId: "", regClass, description: "", status: "DRAFT", tagline: null, brand: "Herbal Holland", line: null, strain: null,
  thcMin: null, thcMax: null, cbdMin: null, cbdMax: null, effects: [], flavours: [], lineage: null, origin: null, heritage: false, featured: false, tobaccoRelated: false,
  legalBasis: DEFAULT_LEGAL_BASIS[regClass] ?? null, cbdMgPerPack: null, cbdMgPerDay: null, claims: [], netContent: null, netUnit: null, ingredients: null, allergens: [], naturalCbd: false,
});
const PRODUCT_FIELDS = Object.keys(newProduct("ACCESSORY")) as (keyof ProductData)[];
const VARIANT_FIELDS: (keyof VariantData)[] = ["name", "barcode", "grams", "priceCents", "wholesaleCents", "costCents", "podSku", "active", "caseQty"];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Keeps only the facts the class carries, as the product form saves them. */
function gate(p: ProductData, c: RegClass): ProductData {
  const facts = PRODUCT_FACTS[c] ?? [];
  const net = facts.includes("netContent") ? p.netContent : null;
  return {
    ...(Object.fromEntries(PRODUCT_FIELDS.map((k) => [k, p[k]])) as ProductData),
    regClass: c,
    cbdMgPerPack: CBD_CLASSES.includes(c) ? p.cbdMgPerPack : null,
    cbdMgPerDay: c === "CBD" ? p.cbdMgPerDay : null,
    netContent: net,
    netUnit: net != null ? p.netUnit : null,
    ingredients: facts.includes("ingredients") ? p.ingredients : null,
    allergens: facts.includes("allergens") ? p.allergens.filter((a) => a in ALLERGENS) : [],
    naturalCbd: c === "CBD_FOOD" && p.naturalCbd,
  };
}

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/**
 * The dry run: what each row would do (create, update, unchanged or error, with the reasons), and the writes for the
 * rows without errors. Rows of the same product are one product: the first value given for each product field wins,
 * later rows may repeat it or leave it empty. A row with an error is skipped entirely; the rest still go in.
 */
export function planImport(read: ImportRead, snap: ImportSnapshot): ImportPlan {
  const counts: ImportCounts = { rows: read.records.length, create: 0, update: 0, unchanged: 0, errors: 0, productsNew: 0, productsUpdated: 0, variantsNew: 0, variantsUpdated: 0, compliance: 0, prices: 0, stockLines: 0, stockUnits: 0, stockValueCents: 0 };
  const plan: ImportPlan = { fileErrors: [...read.fileErrors], warnings: [...read.warnings], rows: [], products: [], variants: [], stock: [], counts };
  const loc = snap.location;
  if (!loc && read.records.some((r) => qtyOf(r) > 0)) plan.fileErrors.push("Some rows have opening stock: choose where it is — a warehouse or a store — or clear the stock column.");
  if (plan.fileErrors.length) return plan;

  const byKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const catByName = new Map(snap.categories.map((c) => [byKey(c.name), c]));
  const catBySlug = new Map(snap.categories.map((c) => [c.slug, c]));
  const catName = new Map(snap.categories.map((c) => [c.id, c.name]));
  const variantBySku = new Map(snap.variants.map((v) => [v.sku, v]));
  const productById = new Map(snap.products.map((p) => [p.id, p]));
  const productBySlug = new Map(snap.products.map((p) => [p.slug, p]));
  const barcodeOwner = new Map(snap.barcodes.map((b) => [b.barcode, b.sku]));
  const batchByCode = new Map(snap.batches.map((b) => [b.code, b]));

  // File-wide: a SKU, barcode or new batch appears once; template examples never go in.
  const firstSku = new Map<string, number>(), firstBarcode = new Map<string, number>(), batchSku = new Map<string, string>();
  for (const r of read.records) {
    const sku = skuOf(r), barcode = r.variant.barcode as string | undefined;
    if (sku?.startsWith("EXAMPLE-")) r.errors.push("An example row from the template: replace it with your own product, or delete it");
    if (sku && firstSku.has(sku)) r.errors.push(`SKU ${sku} is also on row ${firstSku.get(sku)}`);
    else if (sku) firstSku.set(sku, r.line);
    if (barcode && firstBarcode.has(barcode)) r.errors.push(`barcode: ${barcode} is also on row ${firstBarcode.get(barcode)}`);
    else if (barcode) firstBarcode.set(barcode, r.line);
    const other = sku && qtyOf(r) > 0 ? batchSku.get(batchOf(r)) : undefined;
    if (other && other !== sku) r.errors.push(`batch: ${batchOf(r)} is also used for ${other} in this file`);
    else if (sku && qtyOf(r) > 0) batchSku.set(batchOf(r), sku);
  }

  // One product per name (by its URL slug).
  const groups = new Map<string, ImportRecord[]>();
  for (const r of read.records) {
    const name = r.product.name as string | undefined;
    const slug = name ? slugify(name) : "";
    if (name && !slug) r.errors.push("product: the name needs letters or digits");
    const key = slug || `#${r.line}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const out = new Map<number, PlanRow>();
  const claimed = new Map<string, number>();
  for (const [slug, rows] of groups) {
    const problems: string[] = [];
    const held = rows.filter((r) => r.productErrors.length).map((r) => r.line);
    // The product: the one its SKUs belong to, else the one with this name, else a new one.
    const owners = [...new Set(rows.map((r) => variantBySku.get(skuOf(r) ?? "")?.productId).filter((x): x is string => !!x))];
    let existing: ExistingProduct | null = null;
    if (owners.length > 1) problems.push(`These SKUs belong to different products (${owners.map((id) => `“${productById.get(id)?.name}”`).join(", ")}): the import doesn't move variants between products`);
    else existing = (owners.length ? productById.get(owners[0]) : productBySlug.get(slug)) ?? null;
    if (existing && claimed.has(existing.id)) problems.push(`Row ${claimed.get(existing.id)} already updates “${existing.name}” under another name`);
    else if (existing) claimed.set(existing.id, rows[0].line);

    // Product fields: the first value given wins; a different value on a later row is that row's error.
    const given: Record<string, Value> = {}, from: Record<string, number> = {};
    const differs = (f: string, a: Value, b: Value) => (f === "category" ? byKey(a as string) !== byKey(b as string) : !same(a, b));
    for (const r of rows)
      for (const [f, v] of Object.entries(r.product)) {
        if (!(f in given)) (given[f] = v), (from[f] = r.line);
        else if (differs(f, given[f], v)) r.errors.push(`${header("product", f)} doesn't match row ${from[f]}: a product's details are the same on each of its rows (or empty after the first)`);
      }
    const regClass = (given.regClass as RegClass | undefined) ?? existing?.regClass;
    if (given.category != null) {
      const c = catByName.get(byKey(given.category as string)) ?? catBySlug.get((given.category as string).trim().toLowerCase());
      if (c) given.categoryId = c.id;
      else problems.push(`Unknown category “${given.category}”: add it in HQ → Catalogue → Categories first (the import never creates categories)`);
      delete given.category;
    }
    // Photos are fetched after the import (not a product field): https:// addresses only, a handful per product.
    let images: string[] = [];
    if (given.imageUrls != null) {
      images = given.imageUrls as string[];
      delete given.imageUrls;
      if (images.length > IMPORT_MAX_IMAGES) problems.push(`image_urls: up to ${IMPORT_MAX_IMAGES} photos per product`);
      const badUrl = images.find((u) => !/^https:\/\/[^\s"'<>]+$/i.test(u));
      if (badUrl) problems.push(`image_urls: “${badUrl.slice(0, 60)}” isn't an https:// web address`);
    }

    let product: ProductWrite | null = null;
    if (regClass && (given.categoryId || existing) && !problems.length && !held.length) {
      const data = { ...(existing ? gate(existing, regClass) : newProduct(regClass)), ...(given as Partial<ProductData>) };
      if (given.effects) data.effects = data.effects.map((e) => e.toLowerCase());
      // A new class brings its own legal basis, unless the old one was written by hand.
      if (existing && regClass !== existing.regClass && given.legalBasis == null && (!existing.legalBasis || Object.values(DEFAULT_LEGAL_BASIS).includes(existing.legalBasis)))
        data.legalBasis = DEFAULT_LEGAL_BASIS[regClass] ?? null;
      const final = gate(data, regClass);
      const changed = existing ? PRODUCT_FIELDS.filter((k) => !same(existing[k], final[k])) : [];
      if (!existing || changed.length) {
        if (data.description.length < 20) problems.push(existing && given.description == null ? "description: write at least a sentence — it appears on the product page" : "description: at least a sentence (20 characters or more) — it appears on the product page");
        if (data.thcMin != null && data.thcMax != null && data.thcMin > data.thcMax) problems.push("thc_max_pct: at least thc_min_pct");
        if (data.cbdMin != null && data.cbdMax != null && data.cbdMin > data.cbdMax) problems.push("cbd_max_pct: at least cbd_min_pct");
        problems.push(...validateProduct(data));
        const flag = screenCopy([data.name, data.tagline ?? "", data.description].join(" "))[0];
        if (flag) problems.push(`“${flag.term}” in the name, tagline or description — ${flag.reason}`);
      }
      if (!problems.length) product = { key: slug, id: existing?.id ?? null, slug: existing?.slug ?? slug, data: final, changed, compliance: !!existing && complianceChange(changed, regClass), images };
    }

    let first = true, newVariants = 0;
    for (const r of rows) {
      const sku = skuOf(r) ?? "";
      const ev = variantBySku.get(sku);
      const errors = [...r.errors, ...r.productErrors, ...problems];
      if (held.length && !r.productErrors.length) errors.push(`The product's details on row ${held.join(", ")} need fixing first`);
      const got = <T>(f: keyof VariantData) => r.variant[f] as T | undefined;
      const v: VariantData = {
        sku, name: got<string>("name") ?? ev?.name ?? "", barcode: got<string>("barcode") ?? ev?.barcode ?? null, grams: got<number>("grams") ?? ev?.grams ?? null,
        priceCents: got<number>("priceCents") ?? ev?.priceCents ?? 0, wholesaleCents: got<number>("wholesaleCents") ?? ev?.wholesaleCents ?? 0,
        costCents: got<number>("costCents") ?? ev?.costCents ?? 0, podSku: got<string>("podSku") ?? ev?.podSku ?? null, active: got<boolean>("active") ?? ev?.active ?? true,
        caseQty: got<number>("caseQty") ?? ev?.caseQty ?? 1,
      };
      if (got<number>("priceCents") === 0) errors.push("rrp_incl_vat: more than R0");
      if (got<number>("caseQty") === 0) errors.push("case_qty: at least 1 (leave it empty for single units)");
      const owner = v.barcode ? barcodeOwner.get(v.barcode) : undefined;
      if (owner && owner !== sku) errors.push(`barcode: ${v.barcode} is already on SKU ${owner}`);

      let stock: StockWrite | null = null;
      const qty = qtyOf(r);
      if (qty > 0 && loc && sku) {
        const code = batchOf(r), batch = batchByCode.get(code), expires = r.stock.expires as string | undefined;
        if (v.podSku) errors.push("stock: made to order by the merch partner, so it carries no stock");
        if (regClass && snap.licensedOnly.includes(regClass) && !loc.licences.includes(regClass)) errors.push(`stock: ${REG_CLASS_LABEL[regClass]} can only be held under a licence, and ${loc.name} doesn't hold one`);
        if (batch && batch.variantId !== ev?.id) errors.push(`batch: ${code} belongs to another SKU — use a different code`);
        if (expires && expires <= snap.today) errors.push("expires: that date has passed — expired stock can't be loaded");
        stock = { line: r.line, sku, qty, batchCode: code, batchId: batch?.id ?? null, expires: batch ? null : (expires ?? null), unitCostCents: loc.kind === "WAREHOUSE" ? v.costCents : v.wholesaleCents };
      }

      const notes: string[] = [];
      const changed = ev ? VARIANT_FIELDS.filter((k) => !same(ev[k], v[k])) : [];
      const productNotes = !errors.length && first && product ? productChanges(product, existing, catName) : [];
      if (!errors.length) {
        first = false;
        notes.push(...productNotes);
        if (!ev) notes.push(`New variant · RRP ${zar(v.priceCents)}, wholesale ${zar(v.wholesaleCents)}, cost ${zar(v.costCents)}`);
        for (const [k, label] of [["priceCents", "RRP"], ["wholesaleCents", "Wholesale"], ["costCents", "Cost"]] as const)
          if (changed.includes(k)) notes.push(`${label} ${zar(ev![k])} → ${zar(v[k])}`);
        const other = changed.filter((k) => !k.endsWith("Cents")).map((k) => header("variant", k));
        if (other.length) notes.push(`Changes ${other.join(", ")}`);
        if (stock) notes.push(`Opening stock: ${num(qty)} at ${loc!.name} · batch ${stock.batchCode}${stock.batchId ? " (already on record)" : stock.expires ? `, expires ${stock.expires}` : ""}`);
        plan.variants.push({ line: r.line, productKey: slug, productId: existing?.id ?? null, id: ev?.id ?? null, data: v, changed, before: ev ? [ev.priceCents, ev.wholesaleCents, ev.costCents] : null, sortOrder: (existing?.variantCount ?? 0) + (ev ? 0 : newVariants++) });
        if (stock) plan.stock.push(stock);
      }
      const action: RowAction = errors.length ? "error" : !ev ? "create" : changed.length || productNotes.length ? "update" : "unchanged";
      counts[action === "error" ? "errors" : action]++;
      out.set(r.line, { line: r.line, sku, product: (r.product.name as string) ?? "", variant: v.name, action, notes, errors: [...new Set(errors)], stock: stock && !errors.length ? qty : 0 });
    }
    if (product && !first && (!product.id || product.changed.length || product.images.length)) plan.products.push(product);
  }

  plan.rows = [...out.values()].sort((a, b) => a.line - b.line);
  // Variants of a product with no row left to import stay out too; so do their writes.
  const written = new Set(plan.products.map((p) => p.key));
  plan.variants = plan.variants.filter((v) => v.productId || written.has(v.productKey));
  for (const p of plan.products) {
    if (p.id) counts.productsUpdated++;
    else counts.productsNew++;
    if (p.compliance) counts.compliance++;
  }
  for (const v of plan.variants) {
    if (!v.id) counts.variantsNew++;
    else if (v.changed.length) counts.variantsUpdated++;
    if (v.id && v.changed.some((k) => k.endsWith("Cents"))) counts.prices++;
  }
  for (const s of plan.stock) {
    counts.stockLines++;
    counts.stockUnits += s.qty;
    counts.stockValueCents += s.qty * s.unitCostCents;
  }
  return plan;
}

function productChanges(p: ProductWrite, existing: ExistingProduct | null, catName: Map<string, string>) {
  const photos = p.images.length ? [`${count(p.images.length, "photo")} to fetch`] : [];
  if (!existing) return [`New product in ${catName.get(p.data.categoryId) ?? "its category"} · ${REG_CLASS_LABEL[p.data.regClass]} · ${title(p.data.status)}`, ...photos];
  if (!p.changed.length) return photos;
  const say = (k: keyof ProductData) =>
    k === "status" ? `status ${title(existing.status)} → ${title(p.data.status)}`
    : k === "regClass" ? `class ${existing.regClass} → ${p.data.regClass}`
    : k === "categoryId" ? `category → ${catName.get(p.data.categoryId)}`
    : k === "name" ? `renamed from “${existing.name}”`
    : header("product", k);
  return [`Product: ${p.changed.map((k) => say(k as keyof ProductData)).join(", ")}`, ...photos];
}

/** What the person saw in the preview; the import refuses to run if the file would now do something else. */
export const planDigest = (c: ImportCounts) => [c.create, c.update, c.unchanged, c.errors, c.productsNew, c.productsUpdated, c.stockUnits].join("-");

const count = (n: number, one: string) => `${num(n)} ${one}${n === 1 ? "" : "s"}`;
/** The confirmation after an import: "Imported: 2 new products, 5 new variants; 1 product updated; 480 units of opening stock at …". */
export function importSummary(c: ImportCounts, location: string | null) {
  const made = [c.productsNew && count(c.productsNew, "new product"), c.variantsNew && count(c.variantsNew, "new variant")].filter(Boolean).join(", ");
  const changed = [c.productsUpdated && count(c.productsUpdated, "product"), c.variantsUpdated && count(c.variantsUpdated, "variant")].filter(Boolean).join(" and ");
  const parts = [made, changed && `${changed} updated`, c.stockUnits && location && `${count(c.stockUnits, "unit")} of opening stock at ${location}`].filter(Boolean);
  const skipped = c.errors ? ` ${count(c.errors, "row")} with errors ${c.errors === 1 ? "was" : "were"} skipped.` : "";
  return `Imported: ${parts.join("; ")}.${skipped}`;
}

// ── The template ──────────────────────────────────────────────────────────────
const EXAMPLES: Record<string, string>[] = [
  {
    sku: "EXAMPLE-OIL-30", product: "Example Calm Oil 300mg", variant: "30 ml", category: "CBD Wellness", class: "CBD", rrp_incl_vat: "349.00", wholesale_excl_vat: "160.00", cost_excl_vat: "95.00",
    status: "DRAFT", description: "Broad-spectrum hemp extract in MCT oil with natural peppermint. Ten milligrams a day, in two servings.", tagline: "10 mg a day, every day", brand: "Herbal Holland", line: "HOUSE",
    thc_max_pct: "0.001", cbd_mg_per_pack: "300", cbd_mg_per_day: "10", ingredients: "MCT oil (from coconut), broad-spectrum hemp extract (300 mg CBD), natural peppermint oil", allergens: "none",
    claims: "Supports everyday calm", effects: "calm|focus", flavours: "Peppermint", image_urls: "https://example.com/photos/calm-oil-front.jpg|https://example.com/photos/calm-oil-back.jpg", active: "yes", case_qty: "12", stock: "24", batch: "EXAMPLE-OIL-2609", expires: "2027-09-30",
  },
  {
    sku: "EXAMPLE-JAR-250", product: "Example Stash Jar", variant: "250 ml", category: "Accessories", class: "ACCESSORY", rrp_incl_vat: "189.00", wholesale_excl_vat: "85.00", cost_excl_vat: "45.00",
    status: "DRAFT", description: "An airtight, UV-blocking glass jar with a bamboo lid. Keeps things fresh and out of the light.", brand: "Herbal Holland", line: "HOUSE", tobacco_related: "no", case_qty: "6", stock: "12",
  },
  { sku: "EXAMPLE-JAR-500", product: "Example Stash Jar", variant: "500 ml", category: "Accessories", class: "ACCESSORY", rrp_incl_vat: "249.00", wholesale_excl_vat: "112.00", cost_excl_vat: "60.00", case_qty: "6", stock: "12" },
];

/** The CSV template: every column, with example rows (which the import refuses until they're replaced). */
export const importTemplate = () => toCsv({ columns: COLUMNS.map((c) => ({ key: c.key, label: c.key })), rows: EXAMPLES });
