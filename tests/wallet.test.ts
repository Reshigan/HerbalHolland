// Wallet passes: the Apple pass and manifest, a readable stored ZIP, the Google object and a verifiable RS256 JWT.
import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appleManifest, applePassJson, crc32, googleGenericObject, googleObjectId, googleSaveJwtClaims, googleSaveUrl, signJwtRS256, zipStore } from "@/lib/wallet";

const member = { memberNo: "HH0001234", firstName: "Lindiwe", tierName: "Bloom", points: 1250, founding: 42 };
const site = "https://shop.herbalholland.com";

describe("Apple Wallet", () => {
  it("builds a store card with the member number as the QR code, tier, points and first name only", () => {
    const p = applePassJson(member, { passTypeId: "pass.com.herbalholland.rewards", teamId: "ABCDE12345" }, site);
    expect(p).toMatchObject({ formatVersion: 1, passTypeIdentifier: "pass.com.herbalholland.rewards", teamIdentifier: "ABCDE12345", serialNumber: "HH0001234", sharingProhibited: true });
    expect(p.barcodes[0]).toEqual({ format: "PKBarcodeFormatQR", message: "HH0001234", messageEncoding: "iso-8859-1", altText: "HH0001234" });
    expect(p.storeCard.primaryFields[0]).toMatchObject({ key: "points", value: 1250 });
    expect(p.storeCard.headerFields[0].value).toBe("Bloom");
    expect(p.storeCard.auxiliaryFields[0].value).toBe("No. 0042");
    expect(JSON.stringify(p)).not.toMatch(/phone|email|surname|dob/i);
    expect(p).not.toHaveProperty("webServiceURL");
    expect(applePassJson({ ...member, founding: null }, { passTypeId: "x", teamId: "y", webServiceUrl: `${site}/api/wallet`, authenticationToken: "tok" }, site)).toMatchObject({ webServiceURL: `${site}/api/wallet`, authenticationToken: "tok" });
  });
  it("hashes every file with SHA-1 for the manifest", () => {
    expect(appleManifest({ "pass.json": new TextEncoder().encode("hello") })).toEqual({ "pass.json": "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d" });
  });
});

/** Reads a stored ZIP back: local headers in order, then the central directory count. */
function readZip(z: Uint8Array) {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const files: Record<string, string> = {};
  let at = 0;
  while (dv.getUint32(at, true) === 0x04034b50) {
    const method = dv.getUint16(at + 8, true);
    const crc = dv.getUint32(at + 14, true);
    const size = dv.getUint32(at + 18, true);
    const nameLen = dv.getUint16(at + 26, true);
    const extraLen = dv.getUint16(at + 28, true);
    const name = new TextDecoder().decode(z.subarray(at + 30, at + 30 + nameLen));
    const data = z.subarray(at + 30 + nameLen + extraLen, at + 30 + nameLen + extraLen + size);
    expect(method).toBe(0);
    expect(crc).toBe(crc32(data));
    files[name] = new TextDecoder().decode(data);
    at += 30 + nameLen + extraLen + size;
  }
  expect(dv.getUint32(at, true)).toBe(0x02014b50);
  const end = z.byteLength - 22;
  expect(dv.getUint32(end, true)).toBe(0x06054b50);
  return { files, entries: dv.getUint16(end + 10, true), cdOffset: dv.getUint32(end + 16, true) };
}

describe("zipStore", () => {
  it("writes a stored archive with correct CRCs and a central directory", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const z = zipStore({ "pass.json": new TextEncoder().encode('{"a":1}'), "icon.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
    const r = readZip(z);
    expect(r.entries).toBe(2);
    expect(Object.keys(r.files)).toEqual(["pass.json", "icon.png"]);
    expect(r.files["pass.json"]).toBe('{"a":1}');
    expect(z.subarray(r.cdOffset, r.cdOffset + 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x01, 0x02]));
  });
});

describe("Google Wallet", () => {
  const cfg = { issuerId: "3388000000012345678", serviceAccountEmail: "wallet@project.iam.gserviceaccount.com", privateKeyPem: "" };
  it("builds a generic object keyed by member number with the QR code, tier and points", () => {
    const o = googleGenericObject(member, cfg, site);
    expect(o.id).toBe("3388000000012345678.HH0001234");
    expect(o.classId).toBe("3388000000012345678.herbal_holland_rewards");
    expect(o.barcode).toEqual({ type: "QR_CODE", value: "HH0001234", alternateText: "HH0001234" });
    expect(o.textModulesData.map((t) => t.body)).toEqual(["1250", "HH0001234", "No. 0042"]);
    expect(googleObjectId(cfg, "HH 12/3")).toBe("3388000000012345678.HH_12_3");
  });
  it("signs a Save to Wallet JWT that the public key verifies", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const claims = googleSaveJwtClaims({ ...cfg, privateKeyPem: pem }, member, site, new Date("2026-09-29T10:00:00Z"));
    expect(claims).toMatchObject({ iss: cfg.serviceAccountEmail, aud: "google", typ: "savetowallet", iat: 1790676000, origins: [site] });
    const jwt = signJwtRS256(claims, pem);
    const [h, b, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(b, "base64url").toString()).payload.genericObjects[0].id).toBe("3388000000012345678.HH0001234");
    expect(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
    expect(googleSaveUrl(jwt)).toBe(`https://pay.google.com/gp/v/save/${jwt}`);
  });
});
