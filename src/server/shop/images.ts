// Product photos. They arrive through the catalogue import's image_urls column (HQ → Catalogue → Import): each
// address is fetched once the import has committed, checked by its bytes (JPG, PNG or WebP, 5 MB at most), kept in
// storage (@/server/storage) and served to everyone at /media/[id]. A photo already on the product (same bytes) is
// skipped, so importing a file twice never doubles the gallery. Products without photos keep the generated art.
import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { cache } from "react";
import { db } from "@/server/db";
import { putObject } from "@/server/storage";
import { extFor, sniffType, type UploadType } from "@/lib/files";
import { IMPORT_MAX_IMAGES } from "@/lib/catalogue-import";
import { isPublicIp } from "@/lib/net";

export const PRODUCT_IMAGE_TYPES: UploadType[] = ["image/jpeg", "image/png", "image/webp"];
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type ProductPhoto = { id: string; alt: string };
export const productImageUrl = (id: string) => `/media/${id}`;

/** A product's photos in order; the first is the main picture. */
export const productImages = cache(async (productId: string): Promise<ProductPhoto[]> =>
  (await db.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" }, select: { uploadId: true, alt: true } })).map((r) => ({ id: r.uploadId, alt: r.alt })),
);

/** The main photo of each product that has one (for cards and grids). */
export async function mainImages(productIds: string[]): Promise<Map<string, ProductPhoto>> {
  const out = new Map<string, ProductPhoto>();
  if (!productIds.length) return out;
  const rows = await db.productImage.findMany({ where: { productId: { in: productIds } }, orderBy: [{ productId: "asc" }, { sortOrder: "asc" }], select: { productId: true, uploadId: true, alt: true } });
  for (const r of rows) if (!out.has(r.productId)) out.set(r.productId, { id: r.uploadId, alt: r.alt });
  return out;
}

/** Is this upload a product photo? (The media route serves those publicly.) */
export const isProductImage = async (uploadId: string) => !!(await db.productImage.findFirst({ where: { uploadId }, select: { id: true } }));

export type ImageImportResult = { fetched: number; skipped: number; failed: { url: string; reason: string }[] };

const isPrivateHost = (host: string) => !host.includes(".") || /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^\[/.test(host) || /(^|\.)(localhost|local|internal)$/i.test(host);

async function fetchImage(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("not a web address");
  }
  if (u.protocol !== "https:" || isPrivateHost(u.hostname)) throw new Error("only public https:// addresses");
  // The name must lead to public addresses only (no internal service behind a public-looking name), and a redirect is
  // never followed (it could point anywhere): the photo's own address, please.
  const addresses = await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error("that address doesn't resolve");
  if (addresses.some((a) => !isPublicIp(a.address))) throw new Error("only public https:// addresses");
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000), redirect: "manual", headers: { accept: "image/*" } });
  if (res.status >= 300 && res.status < 400) throw new Error("it redirects, so use the photo's own address");
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > PRODUCT_IMAGE_MAX_BYTES) throw new Error("over 5 MB");
  // At most 5 MB is read, whatever length the server gives (or doesn't).
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let r = reader && (await reader.read()); r && !r.done; r = await reader!.read()) {
    size += r.value.length;
    if (size > PRODUCT_IMAGE_MAX_BYTES) {
      await reader!.cancel();
      throw new Error("over 5 MB");
    }
    chunks.push(r.value);
  }
  if (!size) throw new Error("empty file");
  const bytes = new Uint8Array(size);
  chunks.reduce((at, c) => (bytes.set(c, at), at + c.length), 0);
  return bytes;
}

/** Fetches and keeps up to six photos for a product, after the import committed. Never throws: failures are listed. */
export async function importProductImages(productId: string, urls: string[], opts: { uploadedById?: string | null; alt: string }): Promise<ImageImportResult> {
  const result: ImageImportResult = { fetched: 0, skipped: 0, failed: [] };
  const existing = await db.productImage.findMany({ where: { productId }, select: { uploadId: true, sortOrder: true } });
  const known = new Set(existing.length ? (await db.upload.findMany({ where: { id: { in: existing.map((e) => e.uploadId) } }, select: { sha256: true } })).map((u) => u.sha256) : []);
  let sortOrder = existing.reduce((m, e) => Math.max(m, e.sortOrder + 1), 0);
  for (const url of urls.slice(0, IMPORT_MAX_IMAGES)) {
    try {
      const bytes = await fetchImage(url);
      const type = sniffType(bytes);
      if (!type || !PRODUCT_IMAGE_TYPES.includes(type)) throw new Error("not a JPG, PNG or WebP image");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (known.has(sha256)) {
        result.skipped++;
        continue;
      }
      const key = `products/${productId}/${randomUUID()}.${extFor(type)}`;
      let fileName = `photo.${extFor(type)}`;
      try {
        fileName = decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "").slice(0, 120) || fileName;
      } catch {}
      await putObject(key, bytes, type);
      const upload = await db.upload.create({ data: { key, fileName, contentType: type, sizeBytes: bytes.length, sha256, uploadedById: opts.uploadedById ?? null } });
      await db.productImage.create({ data: { productId, uploadId: upload.id, alt: opts.alt.slice(0, 160), sortOrder: sortOrder++ } });
      known.add(sha256);
      result.fetched++;
    } catch (e) {
      result.failed.push({ url, reason: (e as Error).message });
    }
  }
  return result;
}
