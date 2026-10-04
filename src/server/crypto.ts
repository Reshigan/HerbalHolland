import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Passwords and PINs are stored as scrypt$N$r$p$salt$hash. Hashes from before the cost was stored read as
// scrypt$salt$hash with N=16384, r=8, p=1; needsRehash() says when a stored hash is below today's cost, and a right
// password or PIN replaces it (src/server/auth.ts upgradeHash). p=5 multiplies the work, not the memory: 16 MiB fits
// Node's default 32 MiB scrypt limit.
type Cost = { N: number; r: number; p: number };
const COST: Cost = { N: 16384, r: 8, p: 5 };
const LEGACY: Cost = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 32;

const derive = (secret: string, salt: Buffer, cost: Cost) =>
  new Promise<Buffer>((done, fail) => scrypt(secret, salt, KEY_BYTES, cost, (err, key) => (err ? fail(err) : done(key))));

function parse(stored?: string | null): { cost: Cost; salt: Buffer; hash: Buffer } | null {
  const parts = stored?.split("$") ?? [];
  if (parts[0] !== "scrypt") return null;
  if (parts.length === 3) return { cost: LEGACY, salt: Buffer.from(parts[1], "base64url"), hash: Buffer.from(parts[2], "base64url") };
  if (parts.length !== 6) return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every((n) => Number.isSafeInteger(n) && n > 0)) return null;
  return { cost: { N, r, p }, salt: Buffer.from(parts[4], "base64url"), hash: Buffer.from(parts[5], "base64url") };
}

export async function hashSecret(secret: string) {
  const salt = randomBytes(16);
  const hash = await derive(secret, salt, COST);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** Whether the secret matches the stored hash. False for anything malformed, including a digest that isn't 32 bytes. */
export async function verifySecret(secret: string, stored?: string | null) {
  const h = parse(stored);
  if (!h || h.hash.length !== KEY_BYTES) return false;
  try {
    return timingSafeEqual(h.hash, await derive(secret, h.salt, h.cost));
  } catch {
    return false; // parameters scrypt refuses (not a power of two, over the memory limit)
  }
}

/** True when a stored hash uses an older format or a lower cost than new hashes do. */
export function needsRehash(stored?: string | null) {
  const h = parse(stored);
  return !!h && (h.cost.N !== COST.N || h.cost.r !== COST.r || h.cost.p !== COST.p);
}

/** Checked against when there is no account (or no password), so an unknown email costs as much as a wrong password. */
export const NO_HASH = `scrypt$${COST.N}$${COST.r}$${COST.p}$${"A".repeat(22)}$${"A".repeat(43)}`;

/** Constant-time string comparison for tokens and signatures: false (never an exception) when the byte lengths differ. */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
