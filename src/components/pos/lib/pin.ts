// Offline unlock. When a staff member signs in online, the till keeps a salted PBKDF2
// verifier of their PIN (never the PIN) for 12 hours (matching the server session), so
// the till can be unlocked while the connection is down.
import { loadPins, savePins } from "./storage";

const ITERATIONS = 120_000;
const HOURS = 12;

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" }, key, 256));
}

export const offlineUnlockSupported = () => typeof crypto !== "undefined" && !!crypto.subtle;

export async function rememberPin(staffId: string, pin: string) {
  if (!offlineUnlockSupported()) return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pins = loadPins();
  pins[staffId] = { salt: b64(salt), hash: await derive(pin, salt), exp: Date.now() + HOURS * 3_600_000 };
  savePins(pins);
}

/** The server refused this person at the till (their PIN was disabled, say): the till stops unlocking for them offline too. */
export function forgetPin(staffId: string) {
  const pins = loadPins();
  if (!pins[staffId]) return;
  delete pins[staffId];
  savePins(pins);
}

export function canUnlockOffline(staffId: string) {
  const v = loadPins()[staffId];
  return !!v && v.exp > Date.now();
}

export async function verifyOffline(staffId: string, pin: string) {
  const v = loadPins()[staffId];
  if (!v || v.exp < Date.now() || !offlineUnlockSupported()) return false;
  return (await derive(pin, unb64(v.salt))) === v.hash;
}
