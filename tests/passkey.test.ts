import { describe, expect, it } from "vitest";
import { b64u, derToRaw, ES256, PasskeyError, relyingParty, verifyAssertion } from "@/lib/passkey";

const enc = new TextEncoder();

/** r || s (WebCrypto) to DER, as an authenticator sends it. */
function rawToDer(raw: Uint8Array) {
  const int = (v: Uint8Array) => {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0) i++;
    v = v.slice(i);
    if (v[0] & 0x80) v = Uint8Array.from([0, ...v]);
    return [0x02, v.length, ...v];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return Uint8Array.from([0x30, body.length, ...body]);
}

async function ceremony(over: { flags?: number; challenge?: string; origin?: string; rpId?: string } = {}) {
  const { rpId, origin } = relyingParty("https://shop.herbalholland.com");
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = b64u(await crypto.subtle.exportKey("spki", keys.publicKey));
  const rpHash = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(over.rpId ?? rpId)));
  const authenticatorData = Uint8Array.from([...rpHash, over.flags ?? 0x05, 0, 0, 0, 1]);
  const clientDataJSON = enc.encode(JSON.stringify({ type: "webauthn.get", challenge: over.challenge ?? "abc", origin: over.origin ?? origin }));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataJSON));
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, Uint8Array.from([...authenticatorData, ...hash])));
  return { publicKey: spki, alg: ES256, authenticatorData, clientDataJSON, signature: rawToDer(raw), challenge: "abc", origin, rpId };
}

describe("passkey sign-in", () => {
  it("accepts a genuine, user-verified assertion", async () => {
    await expect(verifyAssertion(await ceremony())).resolves.toBeUndefined();
  });
  it("refuses a stale challenge, another site, another relying party and no biometric", async () => {
    await expect(verifyAssertion(await ceremony({ challenge: "old" }))).rejects.toThrow(/expired/);
    await expect(verifyAssertion(await ceremony({ origin: "https://evil.example" }))).rejects.toThrow(/different site/);
    await expect(verifyAssertion(await ceremony({ rpId: "evil.example" }))).rejects.toThrow(/different site/);
    await expect(verifyAssertion(await ceremony({ flags: 0x01 }))).rejects.toThrow(/confirm/);
  });
  it("refuses a tampered signature", async () => {
    const c = await ceremony();
    c.authenticatorData[36] = 9; // the counter changed after signing
    await expect(verifyAssertion(c)).rejects.toThrow(PasskeyError);
  });
  it("turns DER into r || s, padding short integers", () => {
    const raw = new Uint8Array(64).fill(7);
    raw[0] = 0;
    raw[32] = 0x90;
    expect(derToRaw(rawToDer(raw))).toEqual(raw);
  });
});
