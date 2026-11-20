// WebAuthn (passkey) checks for member sign-in with a fingerprint or face, using WebCrypto only.
// Registration trusts no attestation ("none"): the browser hands over the SPKI public key and we keep it.
// Sign-in verifies the assertion: the challenge we issued, our origin, our relying party, user verification
// (the biometric or the phone's PIN) and the signature over authenticatorData || SHA-256(clientDataJSON).

export const ES256 = -7;
export const RS256 = -257;
export const ALGS = [ES256, RS256] as const;

const enc = new TextEncoder();
export const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");
export const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

export class PasskeyError extends Error {}

type ClientData = { type?: string; challenge?: string; origin?: string };

/** The parts of clientDataJSON every ceremony must match. */
export function checkClientData(json: Uint8Array, type: "webauthn.create" | "webauthn.get", challenge: string, origin: string): void {
  let c: ClientData;
  try {
    c = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new PasskeyError("Unreadable passkey response");
  }
  if (c.type !== type) throw new PasskeyError("Wrong passkey ceremony");
  if (!challenge || c.challenge !== challenge) throw new PasskeyError("This sign-in request expired. Try again");
  if (c.origin !== origin) throw new PasskeyError("Passkey made for a different site");
}

/** ECDSA signatures arrive DER-encoded; WebCrypto wants r || s, 32 bytes each. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new PasskeyError("Bad signature");
  let i = 2;
  const part = () => {
    if (der[i++] !== 0x02) throw new PasskeyError("Bad signature");
    const len = der[i++];
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) throw new PasskeyError("Bad signature");
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = part();
  const s = part();
  const raw = new Uint8Array(64);
  raw.set(r);
  raw.set(s, 32);
  return raw;
}

export async function verifyAssertion(a: {
  publicKey: string; // SPKI base64url
  alg: number;
  authenticatorData: Uint8Array<ArrayBuffer>;
  clientDataJSON: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
  challenge: string;
  origin: string;
  rpId: string;
}): Promise<void> {
  checkClientData(a.clientDataJSON, "webauthn.get", a.challenge, a.origin);
  const ad = a.authenticatorData;
  if (ad.length < 37) throw new PasskeyError("Bad passkey response");
  const rpHash = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(a.rpId)));
  if (!rpHash.every((b, i) => b === ad[i])) throw new PasskeyError("Passkey made for a different site");
  const flags = ad[32];
  if (!(flags & 0x01)) throw new PasskeyError("Touch the sensor to sign in");
  if (!(flags & 0x04)) throw new PasskeyError("Your phone didn't confirm it's you. Try again");

  const clientHash = new Uint8Array(await crypto.subtle.digest("SHA-256", a.clientDataJSON));
  const signed = new Uint8Array(ad.length + 32);
  signed.set(ad);
  signed.set(clientHash, ad.length);
  const spki = fromB64u(a.publicKey);
  let ok: boolean;
  if (a.alg === ES256) {
    const key = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(a.signature), signed);
  } else if (a.alg === RS256) {
    const key = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, a.signature, signed);
  } else throw new PasskeyError("Unsupported passkey");
  if (!ok) throw new PasskeyError("That passkey didn't match. Sign in with your number instead");
}

/** The relying party is the shop's host, so a passkey made on the web works in the app (same origin through the TWA). */
export function relyingParty(appUrl: string) {
  const u = new URL(appUrl);
  return { rpId: u.hostname, origin: u.origin };
}
