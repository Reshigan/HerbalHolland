// Temporary passwords, for a person someone else sets up or resets (HQ for HQ staff and owners, an owner or manager
// for store staff): random, readable, and short-lived: they must choose their own at first sign-in, and the
// temporary one stops working after TEMP_PASSWORD_HOURS.
import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no 0/O, 1/l/I
export const TEMP_PASSWORD_HOURS = 72;

/** Twelve characters in three groups ("Kq7m-Xp3t-Rw9z"): about 70 bits. */
export function temporaryPassword() {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join("")).join("-");
}

/** When a temporary password set now stops working. */
export const tempPasswordUntil = (now = new Date()) => new Date(now.getTime() + TEMP_PASSWORD_HOURS * 3_600_000);
