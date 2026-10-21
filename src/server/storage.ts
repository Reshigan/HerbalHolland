// File storage (deposit slips, licence documents, photos, report exports): the R2 bucket bound as `FILES`
// (wrangler.jsonc), read through the request's Cloudflare context. Files are always served through the app
// (auth-checked, audited), never linked to the bucket directly. Outside a Cloudflare request (a script, vitest) there
// is no bucket: the functions throw, and tests that store files mock this module.
import type { R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";

function files(): R2Bucket {
  let bucket: R2Bucket | undefined;
  try {
    bucket = (getCloudflareContext().env as { FILES?: R2Bucket }).FILES;
  } catch {
    bucket = undefined; // not inside a Cloudflare request
  }
  if (!bucket) throw new Error("File storage needs the FILES R2 binding, which only exists inside a Cloudflare request (wrangler.jsonc)");
  return bucket;
}

/** A key is a relative path (`folder/2026-10/uuid.jpg`): no absolute paths, no `..`, so keys can't wander. */
function checkKey(key: string) {
  if (!key || key.startsWith("/") || key.split("/").some((p) => p === "" || p === "." || p === "..")) throw new Error("Bad storage key");
  return key;
}

export async function putObject(key: string, body: Uint8Array<ArrayBuffer>, contentType: string) {
  await files().put(checkKey(key), body, { httpMetadata: { contentType } });
}

export async function getObject(key: string): Promise<Uint8Array> {
  const obj = await files().get(checkKey(key));
  if (!obj) throw new Error(`Storage read failed (no such file: ${key})`);
  return new Uint8Array(await obj.arrayBuffer());
}

export async function deleteObject(key: string) {
  await files().delete(checkKey(key)); // deleting a missing key is not an error on R2
}
