// Photos members send us (review photos, return photos, a picture with a support message): JPEG or PNG only, told
// apart by their bytes, at most 5 MB each, kept in R2 through @/server/storage and served only through
// the app (/media/[id]) after an access check. POPIA: a photo is personal information. It stays with the record it
// belongs to and is never linked to the store directly.
import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import { putObject } from "./storage";
import { extFor, PHOTO_MAX_BYTES, PHOTO_TYPES, sniffType, type UploadType } from "@/lib/files";
import { stripImageMetadata } from "@/lib/strip-metadata";

export class UploadError extends Error {}
export { PHOTO_MAX_BYTES, PHOTO_TYPES };

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b % (1024 * 1024) ? 1 : 0)} MB`;

/** The files a form field holds (`getAll`), leaving out the empty entry a file input sends when nothing was chosen. */
export const filesIn = (fd: FormData, name: string) => fd.getAll(name).filter((f): f is File => f instanceof File && f.size > 0);

/**
 * Checks and stores up to `max` photos; returns the Upload ids in the order they came. A photo that isn't a JPG or
 * PNG, or is over 5 MB, refuses the whole set with a message the member can act on (nothing is stored).
 */
export async function storePhotos(a: { files: File[]; max: number; folder: string; uploadedById?: string | null; storeId?: string | null }): Promise<string[]> {
  const files = a.files.filter((f) => f instanceof File && f.size > 0);
  if (files.length > a.max) throw new UploadError(`Up to ${a.max} photo${a.max === 1 ? "" : "s"}, please`);
  const checked: { bytes: Uint8Array<ArrayBuffer>; type: UploadType; name: string }[] = [];
  for (const f of files) {
    const label = f.name?.trim() || "A photo";
    if (f.size > PHOTO_MAX_BYTES) throw new UploadError(`${label} is ${mb(f.size)}, but photos have to be ${mb(PHOTO_MAX_BYTES)} or less`);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const type = sniffType(bytes);
    if (!type || !PHOTO_TYPES.includes(type)) throw new UploadError(`${label} isn't a JPG or PNG photo`);
    checked.push({ bytes: stripImageMetadata(bytes), type, name: label }); // no GPS, camera or time travels with it
  }
  const ids: string[] = [];
  for (const c of checked) {
    const key = `${a.folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${extFor(c.type)}`;
    await putObject(key, c.bytes, c.type);
    const u = await db.upload.create({
      data: {
        key,
        fileName: c.name.slice(0, 120),
        contentType: c.type,
        sizeBytes: c.bytes.length,
        sha256: createHash("sha256").update(c.bytes).digest("hex"),
        storeId: a.storeId ?? null,
        uploadedById: a.uploadedById ?? null,
      },
    });
    ids.push(u.id);
  }
  return ids;
}

type DocumentRule = { types: readonly UploadType[]; maxBytes: number; label: string };

/** Reads a document and checks it (type by its bytes, size), throwing an UploadError the person can act on. */
export async function readDocument(f: File, a: DocumentRule): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: UploadType }> {
  if (!(f instanceof File) || f.size === 0) throw new UploadError(`Attach the ${a.label}`);
  if (f.size > a.maxBytes) throw new UploadError(`The ${a.label} is ${mb(f.size)}, but documents have to be ${mb(a.maxBytes)} or less`);
  const bytes = new Uint8Array(await f.arrayBuffer());
  const type = sniffType(bytes);
  if (!type || !a.types.includes(type)) throw new UploadError(`The ${a.label} must be a PDF, or a JPG or PNG photo`);
  return { bytes, type };
}

/**
 * Checks and stores one document (a licence, a certificate): a PDF or a photo of an allowed type, told apart by its
 * bytes, no bigger than `maxBytes`. Returns the Upload id. Nothing is stored when the file is refused.
 */
export async function storeDocument(a: DocumentRule & { file: File; folder: string; uploadedById?: string | null; storeId?: string | null }): Promise<string> {
  const f = a.file;
  const { bytes, type } = await readDocument(f, a);
  const key = `${a.folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${extFor(type)}`;
  await putObject(key, bytes, type);
  const u = await db.upload.create({
    data: { key, fileName: (f.name?.trim() || `document.${extFor(type)}`).slice(0, 120), contentType: type, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), storeId: a.storeId ?? null, uploadedById: a.uploadedById ?? null },
  });
  return u.id;
}
