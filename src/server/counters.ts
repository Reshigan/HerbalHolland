import type { Tx } from "./db";

/** Atomic, gap-tolerant sequence (row-locked upsert). */
export async function nextNumber(t: Tx, key: string) {
  const c = await t.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return c.value;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function shortCode(len = 6) {
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}
export const pinCode = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
