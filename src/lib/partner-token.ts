// The member details a partner brand sends with its join link, and the ones we send back: AES-256-GCM under a key
// both sides hold, as one base64url string (iv | ciphertext | tag). Encrypted, not just signed, because it travels in
// a URL. A token that fails any check here is treated as no token at all, so the member still joins by hand.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type PartnerMember = { firstName?: string; lastName?: string; phone: string; email?: string; externalId?: string };

const MAX_TOKEN = 2048;
const MAX_LIFE_S = 7 * 24 * 3600;
const IV = 12;
const TAG = 16;

/** `exp` is a Unix time in seconds. */
export function sealMember(m: PartnerMember, key: Buffer, exp: number) {
  const iv = randomBytes(IV);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(JSON.stringify({ ...m, exp }), "utf8"), c.final(), c.getAuthTag()]);
  return Buffer.concat([iv, body]).toString("base64url");
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : undefined);

export function openMember(token: string, key: Buffer, now = Date.now()): PartnerMember | null {
  if (token.length > MAX_TOKEN) return null;
  const buf = Buffer.from(token, "base64url");
  if (buf.length <= IV + TAG) return null;
  let raw: Record<string, unknown>;
  try {
    const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, IV));
    d.setAuthTag(buf.subarray(buf.length - TAG));
    raw = JSON.parse(Buffer.concat([d.update(buf.subarray(IV, buf.length - TAG)), d.final()]).toString("utf8"));
  } catch {
    return null;
  }
  const seconds = now / 1000;
  if (typeof raw?.exp !== "number" || raw.exp <= seconds || raw.exp > seconds + MAX_LIFE_S) return null;
  const phone = text(raw.phone, 20);
  if (!phone) return null;
  return { phone, firstName: text(raw.firstName, 60), lastName: text(raw.lastName, 60), email: text(raw.email, 120), externalId: text(raw.externalId, 64) };
}
