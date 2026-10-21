// The detached PKCS#7 signature of an Apple Wallet pass, built with WebCrypto: parsed back, the structure is what
// `openssl smime -sign -outform DER` makes, and the signature verifies against the signer's public key.
import { createPrivateKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  algorithm, base64ToBytes, bytesToBase64, certificateIssuerAndSerial, contextTag, DER_TAG, importRsaPrivateKey, integer, OID, octetString, oid, pemBlocks, pemCertificate, pemEncode,
  pkcs7DetachedSignature, readChildren, readOid, readTlv, sequence, setOf, time, tlv,
} from "@/lib/pkcs7";

const subtle = globalThis.crypto.subtle;
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const utf8 = (s: string) => tlv(DER_TAG.UTF8_STRING, new TextEncoder().encode(s));
const name = (cn: string) => sequence(setOf(sequence(oid("2.5.4.3"), utf8(cn))));

/** A throwaway RSA key and a certificate for it (self-signed, enough for the structure under test). */
async function throwawayIdentity(serial: number) {
  const pair = await subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await subtle.exportKey("spki", pair.publicKey));
  const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  const validity = sequence(time(new Date("2026-01-01T00:00:00Z")), time(new Date("2036-01-01T00:00:00Z")));
  const tbs = sequence(contextTag(0, integer(2)), integer(serial), algorithm("1.2.840.113549.1.1.11"), name("Herbal Holland test CA"), validity, name("Pass Type ID: pass.test"), spki);
  const sig = new Uint8Array(await subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, pair.privateKey, tbs as BufferSource));
  const cert = sequence(tbs, algorithm("1.2.840.113549.1.1.11"), tlv(DER_TAG.BIT_STRING, new Uint8Array([0, ...sig])));
  return { pair, cert, certPem: pemEncode("CERTIFICATE", cert), keyPem: pemEncode("PRIVATE KEY", pkcs8) };
}

describe("DER encoder", () => {
  it("encodes lengths, integers, OIDs and times the way DER wants them", () => {
    expect(hex(integer(0))).toBe("020100");
    expect(hex(integer(127))).toBe("02017f");
    expect(hex(integer(128))).toBe("02020080"); // top bit set: a leading zero
    expect(hex(integer(new Uint8Array([0, 0, 1, 2])))).toBe("02020102"); // redundant zeros dropped
    expect(hex(oid("1.2.840.113549.1.7.2"))).toBe("06092a864886f70d010702");
    expect(hex(oid("2.16.840.1.101.3.4.2.1"))).toBe("0609608648016503040201");
    expect(hex(time(new Date("2026-10-21T07:01:26Z")))).toBe("170d3236313032313037303132365a");
    expect(readTlv(time(new Date("2050-01-01T00:00:00Z"))).tag).toBe(DER_TAG.GENERALIZED_TIME);
    expect(hex(tlv(DER_TAG.OCTET_STRING, new Uint8Array(130)).subarray(0, 3))).toBe("048182"); // long-form length
    expect(hex(tlv(DER_TAG.OCTET_STRING, new Uint8Array(300)).subarray(0, 4))).toBe("0482012c");
    expect(hex(contextTag(0, integer(1)))).toBe("a003020101");
    expect(hex(contextTag(0, setOf(integer(1)), "implicit"))).toBe("a003020101"); // the SET's tag replaced, constructed bit kept
    expect(hex(contextTag(1, octetString(new Uint8Array([9])), "implicit"))).toBe("810109");
  });
  it("sorts a SET OF by encoding and reads what it wrote", () => {
    const s = setOf(integer(300), integer(1), oid("1.2.3"));
    expect(readChildren(readTlv(s).content).map((t) => t.tag)).toEqual([DER_TAG.INTEGER, DER_TAG.INTEGER, DER_TAG.OID]);
    expect(hex(readChildren(readTlv(s).content)[0].content)).toBe("01");
    expect(readOid(readTlv(oid("1.2.840.113549.1.9.4")))).toBe("1.2.840.113549.1.9.4");
    expect(readOid(readTlv(oid("2.16.840.1.101.3.4.2.1")))).toBe("2.16.840.1.101.3.4.2.1");
    expect(() => readTlv(new Uint8Array([0x30, 0x05, 0x02]))).toThrow(/truncated/);
  });
  it("round-trips PEM and base64", () => {
    const bytes = new Uint8Array(200).map((_, i) => (i * 7) & 0xff);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    const pem = `${pemEncode("CERTIFICATE", bytes)}${pemEncode("PRIVATE KEY", new Uint8Array([1, 2, 3]))}`;
    expect(pemBlocks(pem).map((b) => b.label)).toEqual(["CERTIFICATE", "PRIVATE KEY"]);
    expect(pemCertificate(pem)).toEqual(bytes);
    expect(pemBlocks(pem.replace(/\n/g, "\\n").replace(/\\n/g, "\n"))[1].der).toEqual(new Uint8Array([1, 2, 3]));
    expect(() => pemCertificate("nothing here")).toThrow(/CERTIFICATE/);
  });
});

describe("pkcs7DetachedSignature", () => {
  it("builds a SignedData whose structure, digest and signature all check out", async () => {
    const signer = await throwawayIdentity(0x1234);
    const wwdr = await throwawayIdentity(0x99);
    const content = new TextEncoder().encode('{"pass.json":"aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"}');
    const now = new Date("2026-10-21T07:01:26Z");
    const der = await pkcs7DetachedSignature({ content, signerCert: pemCertificate(signer.certPem), key: await importRsaPrivateKey(signer.keyPem), certs: [wwdr.cert], now });

    // ContentInfo { signedData, [0] { SignedData } }
    const ci = readTlv(der);
    expect(ci.tag).toBe(DER_TAG.SEQUENCE);
    expect(ci.end).toBe(der.length);
    const [ciOid, wrapped] = readChildren(ci.content);
    expect(readOid(ciOid)).toBe(OID.signedData);
    expect(wrapped.tag).toBe(0xa0);
    const sd = readChildren(readTlv(wrapped.content).content);
    const [version, digestAlgs, encap, certs, signerInfos] = sd;
    expect(hex(version.content)).toBe("01");
    expect(readOid(readChildren(readChildren(digestAlgs.content)[0].content)[0])).toBe(OID.sha256);
    expect(readChildren(encap.content)).toHaveLength(1); // detached: only the content type
    expect(readOid(readChildren(encap.content)[0])).toBe(OID.data);
    expect(certs.tag).toBe(0xa0);
    expect(readChildren(certs.content).map((c) => c.raw)).toEqual([signer.cert, wwdr.cert]);
    expect(signerInfos.tag).toBe(DER_TAG.SET);

    // SignerInfo { 1, issuerAndSerial, sha256, [0] signedAttrs, rsaEncryption, signature }
    const si = readChildren(readChildren(signerInfos.content)[0].content);
    expect(hex(si[0].content)).toBe("01");
    const [issuer, serial] = readChildren(si[1].content);
    expect(issuer.raw).toEqual(certificateIssuerAndSerial(signer.cert).issuer);
    expect(hex(serial.content)).toBe("1234");
    expect(readOid(readChildren(si[2].content)[0])).toBe(OID.sha256);
    expect(si[3].tag).toBe(0xa0);
    const attrs = readChildren(si[3].content).map((a) => {
      const [id, values] = readChildren(a.content);
      return { id: readOid(id), value: readChildren(values.content)[0] };
    });
    expect(attrs.map((a) => a.id).sort()).toEqual([OID.contentType, OID.messageDigest, OID.signingTime].sort());
    expect(readOid(attrs.find((a) => a.id === OID.contentType)!.value)).toBe(OID.data);
    expect(new TextDecoder().decode(attrs.find((a) => a.id === OID.signingTime)!.value.content)).toBe("261021070126Z");
    expect(hex(attrs.find((a) => a.id === OID.messageDigest)!.value.content)).toBe(hex(new Uint8Array(await subtle.digest("SHA-256", content))));
    expect(readOid(readChildren(si[4].content)[0])).toBe(OID.rsaEncryption);
    expect(si[5].tag).toBe(DER_TAG.OCTET_STRING);
    expect(si[5].content).toHaveLength(256);

    // The signature is over the signed attributes re-tagged as a SET (what every CMS verifier reconstructs).
    const signed = tlv(DER_TAG.SET, si[3].content);
    expect(await subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, signer.pair.publicKey, si[5].content as BufferSource, signed as BufferSource)).toBe(true);
    expect(await subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, wwdr.pair.publicKey, si[5].content as BufferSource, signed as BufferSource)).toBe(false);
    expect(hex(der)).not.toContain(hex(content)); // detached: the manifest isn't inside
  });

  it("takes a PKCS#1 'RSA PRIVATE KEY' as well as PKCS#8, and refuses an encrypted one", async () => {
    const id = await throwawayIdentity(1);
    const pkcs1 = createPrivateKey(id.keyPem).export({ type: "pkcs1", format: "pem" }) as string;
    expect(pkcs1).toContain("BEGIN RSA PRIVATE KEY");
    const key = await importRsaPrivateKey(pkcs1);
    const der = await pkcs7DetachedSignature({ content: new Uint8Array([1, 2, 3]), signerCert: id.cert, key });
    expect(readOid(readChildren(readTlv(der).content)[0])).toBe(OID.signedData);
    await expect(importRsaPrivateKey(pemEncode("ENCRYPTED PRIVATE KEY", new Uint8Array([1])))).rejects.toThrow(/passphrase/);
    await expect(importRsaPrivateKey("")).rejects.toThrow(/PRIVATE KEY/);
    expect(() => certificateIssuerAndSerial(sequence(integer(1)))).toThrow(/certificate/);
  });
});
