// Catalogue import: keeps each uploaded CSV (every import traces back to exactly what was uploaded), looks up the slice
// of the catalogue a file touches for the dry run, and applies it in one transaction — products, variants and prices,
// then opening stock through the inventory service — with one audit entry carrying the counts. The rules themselves
// are pure: @/lib/catalogue-import.
import { createHash, randomUUID } from "node:crypto";
import { db, type Tx } from "@/server/db";
import { audit, type Actor } from "@/server/audit";
import { putStock } from "@/server/inventory";
import { queueStoreDay } from "@/server/ledger/core";
import { getSettings } from "@/server/settings";
import { getObject, putObject } from "@/server/storage";
import { importProductImages, type ImageImportResult } from "@/server/shop/images";
import { IMPORT_MAX_BYTES, importKeys, planDigest, planImport, readImport, type ImportPlan, type ImportRead, type ImportSnapshot } from "@/lib/catalogue-import";
import { dayKey, fmtDateTime } from "@/lib/format";

export class ImportError extends Error {}

const PREFIX = "imports/catalogue/";
// Thousands of rows with opening stock post thousands of lots: more than the usual 30 s transaction.
const TIMEOUT_MS = 180_000;
const CHUNK = 500;

/** The file's text: UTF-8 only (Excel: "CSV UTF-8"). */
export function decodeCsv(bytes: Uint8Array) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) throw new ImportError("That's a spreadsheet workbook: in Excel choose File → Save As → “CSV UTF-8”, then upload the .csv file.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ImportError("The file isn't UTF-8 text: in Excel choose File → Save As → “CSV UTF-8”, then upload it again.");
  }
}

/** Checks the file can be read (columns, size) and keeps it. Nothing in the catalogue changes. */
export async function saveImportFile(file: File, userId: string) {
  if (file.size > IMPORT_MAX_BYTES) throw new ImportError("The file is over 2 MB: split it into smaller files.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const read = readImport(decodeCsv(bytes));
  if (read.fileErrors.length) throw new ImportError(read.fileErrors.join(" "));
  const key = `${PREFIX}${dayKey(new Date()).slice(0, 7)}/${randomUUID()}.csv`;
  await putObject(key, bytes, "text/csv");
  return db.upload.create({
    data: { key, fileName: file.name.slice(0, 120) || "catalogue.csv", contentType: "text/csv", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), uploadedById: userId },
  });
}

/** An uploaded catalogue file, with its text. */
export async function loadImportFile(id: string) {
  const upload = await db.upload.findUnique({ where: { id } });
  if (!upload?.key.startsWith(PREFIX)) return null;
  return { upload, text: decodeCsv(await getObject(upload.key)) };
}

/** When a file was imported, and by whom (null if it hasn't been). */
export const importOf = (uploadId: string) =>
  db.auditLog.findFirst({ where: { action: "catalogue.import", entity: "Upload", entityId: uploadId }, select: { at: true, actorName: true } });

/** Where opening stock can go, of the given stores: warehouses first, then stores (not closed ones). */
export const importLocations = (storeIds: string[]) =>
  db.store.findMany({ where: { id: { in: storeIds }, status: { not: "CLOSED" } }, select: { id: true, code: true, name: true, kind: true }, orderBy: [{ kind: "desc" }, { name: "asc" }] });

/** The slice of the catalogue a file touches: its SKUs, product names, barcodes and batches, plus the categories. */
export async function loadSnapshot(client: Tx | typeof db, read: ImportRead, locationId: string | null): Promise<ImportSnapshot> {
  const keys = importKeys(read);
  const [categories, variants, named, barcodes, batches, location, settings] = await Promise.all([
    client.category.findMany({ select: { id: true, name: true, slug: true } }),
    client.variant.findMany({ where: { sku: { in: keys.skus } } }),
    client.product.findMany({ where: { slug: { in: keys.slugs } } }),
    client.variant.findMany({ where: { barcode: { in: keys.barcodes } }, select: { barcode: true, sku: true } }),
    client.batch.findMany({ where: { code: { in: keys.batches } }, select: { id: true, code: true, variantId: true } }),
    locationId ? client.store.findFirst({ where: { id: locationId, status: { not: "CLOSED" } }, select: { id: true, code: true, name: true, kind: true, licences: true } }) : null,
    getSettings(),
  ]);
  const namedIds = new Set(named.map((p) => p.id));
  const owners = [...new Set(variants.map((v) => v.productId))].filter((id) => !namedIds.has(id));
  const products = [...named, ...(owners.length ? await client.product.findMany({ where: { id: { in: owners } } }) : [])];
  const sizes = products.length ? await client.variant.groupBy({ by: ["productId"], where: { productId: { in: products.map((p) => p.id) } }, _count: true }) : [];
  const size = new Map(sizes.map((s) => [s.productId, s._count]));
  return {
    categories,
    products: products.map((p) => ({ ...p, variantCount: size.get(p.id) ?? 0 })),
    variants,
    barcodes: barcodes.map((b) => ({ barcode: b.barcode!, sku: b.sku })),
    batches,
    location,
    licensedOnly: settings.compliance.licensedOnly,
    today: dayKey(new Date()),
  };
}

/** The dry run for a file, against the catalogue as it is now. */
export async function previewImport(text: string, locationId: string | null) {
  const read = readImport(text);
  const snap = await loadSnapshot(db, read, locationId);
  return { plan: planImport(read, snap), location: snap.location };
}

const pick = <T extends object>(data: T, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, data[k as keyof T]])) as Partial<T>;
const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Imports an uploaded file: plans it again inside the transaction (refusing if it would now do something other than
 * the preview showed), writes the rows without errors, and records one catalogue.import audit entry. A file imports once.
 * Product photos (image_urls) are fetched after the transaction commits: a slow or missing picture never holds up or
 * undoes the import — what couldn't be fetched is reported (and audited) instead.
 */
export async function runImport(a: { uploadId: string; fileName: string; sha256: string; text: string; locationId: string | null; digest: string | null; actor: Actor; userId: string }) {
  const read = readImport(a.text);
  const done = await db.$transaction(
    async (t) => {
      await t.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${a.uploadId}))) x`;
      const done = await t.auditLog.findFirst({ where: { action: "catalogue.import", entity: "Upload", entityId: a.uploadId }, select: { at: true } });
      if (done) throw new ImportError(`This file was imported on ${fmtDateTime(done.at)}. To import it again, upload it again.`);
      const snap = await loadSnapshot(t, read, a.locationId);
      if (a.locationId && !snap.location) throw new ImportError("That location is closed or no longer exists: choose another.");
      const plan = planImport(read, snap);
      if (plan.fileErrors.length) throw new ImportError(plan.fileErrors.join(" "));
      if (a.digest && a.digest !== planDigest(plan.counts)) throw new ImportError("The catalogue has changed since this preview: check the preview again, then import.");
      const c = plan.counts;
      if (!c.productsNew && !c.productsUpdated && !c.variantsNew && !c.variantsUpdated && !c.stockLines) throw new ImportError("Nothing to import: every row is unchanged or has an error.");
      const ids = await applyPlan(t, plan, snap, a.userId, `Opening stock · ${a.fileName}`.slice(0, 120));
      await audit(t, a.actor, "catalogue.import", {
        storeId: c.stockLines ? snap.location?.id : null,
        entity: "Upload",
        entityId: a.uploadId,
        data: {
          file: a.fileName, sha256: a.sha256, rows: c.rows,
          created: { products: c.productsNew, variants: c.variantsNew }, updated: { products: c.productsUpdated, variants: c.variantsUpdated },
          unchanged: c.unchanged, skipped: c.errors, complianceChanges: c.compliance, priceChanges: c.prices,
          stock: c.stockLines ? { location: snap.location!.code, lines: c.stockLines, units: c.stockUnits, valueCents: c.stockValueCents } : null,
          // Before → after [RRP, wholesale, cost] in cents (the file holds the rest).
          prices: plan.variants.filter((v) => v.before && v.changed.some((k) => k.endsWith("Cents"))).slice(0, 100).map((v) => ({ sku: v.data.sku, before: v.before, after: [v.data.priceCents, v.data.wholesaleCents, v.data.costCents] })),
        },
      });
      const photos = plan.products.filter((p) => p.images.length).map((p) => ({ productId: p.id ?? ids.get(p.slug)!, name: p.data.name, urls: p.images }));
      return { counts: c, location: c.stockLines ? snap.location : null, photos };
    },
    { timeout: TIMEOUT_MS, maxWait: 10_000 },
  );
  const images: ImageImportResult = { fetched: 0, skipped: 0, failed: [] };
  for (const p of done.photos) {
    const r = await importProductImages(p.productId, p.urls, { uploadedById: a.userId, alt: p.name });
    images.fetched += r.fetched;
    images.skipped += r.skipped;
    images.failed.push(...r.failed);
  }
  if (done.photos.length)
    await audit(db, a.actor, "catalogue.import_images", { entity: "Upload", entityId: a.uploadId, data: { products: done.photos.length, fetched: images.fetched, skipped: images.skipped, failed: images.failed.slice(0, 50) } });
  return { counts: done.counts, location: done.location, images };
}

/** Writes the plan; returns each new product's id by its key (slug), for the photos fetched afterwards. */
async function applyPlan(t: Tx, plan: ImportPlan, snap: ImportSnapshot, userId: string, note: string) {
  const productId = new Map<string, string>(); // a new product's key (its slug) → id
  for (const part of chunks(plan.products.filter((p) => !p.id)))
    for (const p of await t.product.createManyAndReturn({ data: part.map((p) => ({ ...p.data, slug: p.slug })), select: { id: true, slug: true } })) productId.set(p.slug, p.id);
  for (const p of plan.products) if (p.id && p.changed.length) await t.product.update({ where: { id: p.id }, data: pick(p.data, p.changed) });

  for (const part of chunks(plan.variants.filter((v) => !v.id)))
    await t.variant.createMany({ data: part.map((v) => ({ ...v.data, productId: v.productId ?? productId.get(v.productKey)!, sortOrder: v.sortOrder })) });
  for (const v of plan.variants) if (v.id && v.changed.length) await t.variant.update({ where: { id: v.id }, data: pick(v.data, v.changed) });

  // Opening stock: a new batch per new code (released, packed today), then each lot through the inventory service —
  // received at the location's cost, with the correction reason and the file named in the note.
  if (!plan.stock.length || !snap.location) return productId;
  const ids = new Map((await t.variant.findMany({ where: { sku: { in: plan.stock.map((s) => s.sku) } }, select: { id: true, sku: true } })).map((v) => [v.sku, v.id]));
  const batchId = new Map<string, string>();
  const packedAt = new Date();
  for (const part of chunks(plan.stock.filter((s) => !s.batchId)))
    for (const b of await t.batch.createManyAndReturn({
      data: part.map((s) => ({ code: s.batchCode, variantId: ids.get(s.sku)!, supplier: "Opening stock", packedAt, expiresAt: s.expires ? new Date(`${s.expires}T00:00:00+02:00`) : null })),
      select: { id: true, code: true },
    }))
      batchId.set(b.code, b.id);
  for (const s of plan.stock)
    await putStock(t, {
      storeId: snap.location.id, variantId: ids.get(s.sku)!, batchId: s.batchId ?? batchId.get(s.batchCode)!, qty: s.qty, unitCostCents: s.unitCostCents,
      type: "RECEIVE", reason: "CORRECTION", userId, note,
    });
  await queueStoreDay(t, snap.location.id, dayKey(new Date())); // the receipts post with the location's day
  return productId;
}
