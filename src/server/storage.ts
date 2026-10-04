// File storage for uploads (banking slips). Cloudflare R2 — or any S3-compatible store, e.g. MinIO on your own
// server — when S3_BUCKET is set; otherwise files on this server's disk under UPLOAD_DIR (include it in backups).
// Files are always served through the app (auth-checked, audited), never linked to the store directly.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { presign } from "@/lib/sigv4";

function bucket() {
  const name = process.env.S3_BUCKET;
  if (!name) return null;
  const { S3_ENDPOINT: endpoint, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("S3_BUCKET is set but S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are missing");
  const creds = { region: process.env.S3_REGION ?? "auto", accessKeyId, secretAccessKey };
  return (method: "GET" | "PUT" | "DELETE", key: string, expires: number) => presign({ method, url: `${endpoint.replace(/\/$/, "")}/${name}/${key}`, expires, ...creds });
}

const onDisk = (key: string) => {
  const root = resolve(process.env.UPLOAD_DIR ?? ".data/uploads");
  const file = resolve(root, key);
  if (!file.startsWith(root + "/")) throw new Error("Bad storage key");
  return file;
};

export async function putObject(key: string, body: Uint8Array<ArrayBuffer>, contentType: string) {
  const signed = bucket();
  if (!signed) {
    const file = onDisk(key);
    await mkdir(dirname(file), { recursive: true });
    return writeFile(file, body);
  }
  const res = await fetch(signed("PUT", key, 300), { method: "PUT", body, headers: { "content-type": contentType } });
  if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
}

export async function getObject(key: string): Promise<Uint8Array> {
  const signed = bucket();
  if (!signed) return readFile(onDisk(key));
  const res = await fetch(signed("GET", key, 60));
  if (!res.ok) throw new Error(`Storage read failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function deleteObject(key: string) {
  const signed = bucket();
  if (!signed) return rm(onDisk(key), { force: true });
  const res = await fetch(signed("DELETE", key, 60), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed (${res.status})`);
}
