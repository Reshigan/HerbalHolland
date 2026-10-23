// Seals a social account's tokens at rest (AES-256-GCM under a key derived from SESSION_SECRET), so a copy of the
// database alone can't post as the brand. seal → "v1.<iv>.<ciphertext+tag>" in base64url; open reverses it.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { appSecret } from "../secret";

const key = () => createHash("sha256").update(`social-box:${appSecret()}`).digest();

export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final(), c.getAuthTag()]);
  return `v1.${iv.toString("base64url")}.${body.toString("base64url")}`;
}

export function open(sealed: string) {
  const [v, iv, body] = sealed.split(".");
  if (v !== "v1" || !iv || !body) throw new Error("Not a sealed value");
  const buf = Buffer.from(body, "base64url");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString("utf8");
}
