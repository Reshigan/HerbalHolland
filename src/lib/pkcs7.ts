// A detached PKCS#7 / CMS SignedData signature (RFC 5652) in DER, built with WebCrypto: what
// `openssl smime -binary -sign -certfile wwdr.pem -signer cert.pem -inkey key.pem -outform DER` produces, which is
// what Apple Wallet wants as the `signature` file of a .pkpass. No node:crypto, no filesystem, no process: it runs
// on Cloudflare Workers as it does in Node. Also here: the small DER encoder and reader it needs, and PEM parsing.
//
// Shape (RSASSA-PKCS1-v1_5 with SHA-256, as openssl's default):
//   ContentInfo { signedData, [0] SignedData {
//     version 1, digestAlgorithms { sha256 }, encapContentInfo { data } (no content: detached),
//     [0] certificates { signer cert, extra certs (Apple's WWDR) },
//     signerInfos { SignerInfo { version 1, issuerAndSerialNumber, sha256,
//       [0] signedAttrs { contentType data, signingTime, messageDigest sha256(content) }, rsaEncryption, signature } } } }
// The signature covers the signed attributes (re-tagged as a SET), never the content directly.

const subtle = () => globalThis.crypto.subtle;

// ── DER encoding ─────────────────────────────────────────────────────────────
export const DER_TAG = { INTEGER: 0x02, BIT_STRING: 0x03, OCTET_STRING: 0x04, NULL: 0x05, OID: 0x06, UTF8_STRING: 0x0c, PRINTABLE_STRING: 0x13, UTCTIME: 0x17, GENERALIZED_TIME: 0x18, SEQUENCE: 0x30, SET: 0x31 } as const;

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
}

function lengthBytes(n: number): Uint8Array {
  if (n < 0x80) return new Uint8Array([n]);
  const b: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) b.unshift(v & 0xff);
  return new Uint8Array([0x80 | b.length, ...b]);
}

/** TLV: a tag, the definite length, the content. */
export const tlv = (tag: number, content: Uint8Array): Uint8Array => concat(new Uint8Array([tag]), lengthBytes(content.length), content);
export const sequence = (...items: Uint8Array[]) => tlv(DER_TAG.SEQUENCE, concat(...items));
/** A SET OF in DER order: the elements sorted by their encoding (what a verifier re-sorts to when it checks a signature). */
export const setOf = (...items: Uint8Array[]) => tlv(DER_TAG.SET, concat(...[...items].sort(compareBytes)));
/** A SET whose order is given (a SET of certificates, where order carries no meaning but is kept as given). */
export const setAsGiven = (...items: Uint8Array[]) => tlv(DER_TAG.SET, concat(...items));
export const octetString = (b: Uint8Array) => tlv(DER_TAG.OCTET_STRING, b);
export const derNull = () => new Uint8Array([DER_TAG.NULL, 0]);
/** A context-specific tag: `explicit` wraps the content as a constructed [n]; implicit replaces the inner tag with [n] (constructed when the inner was). */
export const contextTag = (n: number, content: Uint8Array, mode: "explicit" | "implicit" = "explicit") => {
  if (mode === "explicit") return tlv(0xa0 | n, content);
  const constructed = content[0] & 0x20;
  return tlv(0x80 | constructed | n, readTlv(content).content);
};

/** A non-negative INTEGER from a number or big-endian bytes (a leading 0 added when the top bit is set). */
export function integer(v: number | Uint8Array): Uint8Array {
  let bytes: number[];
  if (typeof v === "number") {
    if (!Number.isInteger(v) || v < 0) throw new Error("DER INTEGER: only non-negative whole numbers here");
    bytes = [];
    for (let n = v; n > 0; n = Math.floor(n / 256)) bytes.unshift(n & 0xff);
    if (!bytes.length) bytes = [0];
  } else {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0 && !(v[i + 1] & 0x80)) i++;
    bytes = [...v.subarray(i)];
  }
  if (bytes[0] & 0x80) bytes.unshift(0);
  return tlv(DER_TAG.INTEGER, new Uint8Array(bytes));
}

/** OBJECT IDENTIFIER from dotted text ("1.2.840.113549.1.7.2"). */
export function oid(dotted: string): Uint8Array {
  const arcs = dotted.split(".").map((a) => {
    if (!/^\d+$/.test(a)) throw new Error(`Bad OID ${dotted}`);
    return Number(a);
  });
  if (arcs.length < 2 || arcs[0] > 2 || (arcs[0] < 2 && arcs[1] > 39)) throw new Error(`Bad OID ${dotted}`);
  const out = [arcs[0] * 40 + arcs[1]];
  for (const arc of arcs.slice(2)) {
    const b = [arc & 0x7f];
    for (let v = Math.floor(arc / 128); v > 0; v = Math.floor(v / 128)) b.unshift((v & 0x7f) | 0x80);
    out.push(...b);
  }
  return tlv(DER_TAG.OID, new Uint8Array(out));
}

/** UTCTime "YYMMDDhhmmssZ" (CMS uses it for years 1950–2049; later dates get GeneralizedTime). */
export function time(d: Date): Uint8Array {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const y = d.getUTCFullYear();
  const rest = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
  return y >= 1950 && y < 2050 ? tlv(DER_TAG.UTCTIME, ascii(`${p(y % 100)}${rest}`)) : tlv(DER_TAG.GENERALIZED_TIME, ascii(`${p(y, 4)}${rest}`));
}

export const algorithm = (id: string) => sequence(oid(id), derNull());

function compareBytes(a: Uint8Array, b: Uint8Array) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

// ── DER reading (enough to walk a certificate and to check our own output) ───
export type Tlv = { tag: number; content: Uint8Array; /** the whole element, header included */ raw: Uint8Array; /** where the next element starts */ end: number };

export function readTlv(b: Uint8Array, at = 0): Tlv {
  if (at + 2 > b.length) throw new Error("DER: truncated");
  const tag = b[at];
  let len = b[at + 1];
  let p = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || p + n > b.length) throw new Error("DER: bad length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[p++];
  }
  if (p + len > b.length) throw new Error("DER: truncated content");
  return { tag, content: b.subarray(p, p + len), raw: b.subarray(at, p + len), end: p + len };
}

/** The elements inside a constructed value, in order. */
export function readChildren(content: Uint8Array): Tlv[] {
  const out: Tlv[] = [];
  for (let at = 0; at < content.length; ) {
    const t = readTlv(content, at);
    out.push(t);
    at = t.end;
  }
  return out;
}

export function readOid(t: Tlv): string {
  if (t.tag !== DER_TAG.OID) throw new Error("DER: not an OID");
  const b = t.content;
  const arcs: number[] = [];
  let v = 0;
  for (let i = 0; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      if (!arcs.length) arcs.push(v < 80 ? Math.floor(v / 40) : 2, v < 80 ? v % 40 : v - 80);
      else arcs.push(v);
      v = 0;
    }
  }
  return arcs.join(".");
}

// ── PEM ──────────────────────────────────────────────────────────────────────
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/[^A-Za-z0-9+/=]/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Every block in a PEM file, with its label ("CERTIFICATE", "PRIVATE KEY", "RSA PRIVATE KEY"…) and DER bytes. */
export function pemBlocks(pem: string): { label: string; der: Uint8Array }[] {
  const out: { label: string; der: Uint8Array }[] = [];
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  for (let m = re.exec(pem); m; m = re.exec(pem)) out.push({ label: m[1], der: base64ToBytes(m[2]) });
  return out;
}

export function pemEncode(label: string, der: Uint8Array): string {
  const b64 = bytesToBase64(der).replace(/(.{64})/g, "$1\n").trimEnd();
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

/** The first certificate in a PEM string, as DER. */
export function pemCertificate(pem: string): Uint8Array {
  const c = pemBlocks(pem).find((b) => b.label === "CERTIFICATE");
  if (!c) throw new Error("No CERTIFICATE block in the PEM");
  return c.der;
}

export const OID = {
  signedData: "1.2.840.113549.1.7.2",
  data: "1.2.840.113549.1.7.1",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingTime: "1.2.840.113549.1.9.5",
  sha256: "2.16.840.1.101.3.4.2.1",
  rsaEncryption: "1.2.840.113549.1.1.1",
} as const;

/** An RSA private key (PEM, "PRIVATE KEY" PKCS#8 or "RSA PRIVATE KEY" PKCS#1, unencrypted) as a WebCrypto signing key. */
export async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const block = pemBlocks(pem).find((b) => b.label === "PRIVATE KEY" || b.label === "RSA PRIVATE KEY");
  if (!block) {
    if (pemBlocks(pem).some((b) => b.label === "ENCRYPTED PRIVATE KEY")) throw new Error("The private key is encrypted: export it without a passphrase");
    throw new Error("No PRIVATE KEY block in the PEM");
  }
  // PKCS#1 → PKCS#8: PrivateKeyInfo { version 0, rsaEncryption, OCTET STRING pkcs1 }
  const pkcs8 = block.label === "RSA PRIVATE KEY" ? sequence(integer(0), algorithm(OID.rsaEncryption), octetString(block.der)) : block.der;
  return subtle().importKey("pkcs8", pkcs8 as BufferSource, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

/** The issuer Name (DER, as is) and serial number (INTEGER content bytes) of an X.509 certificate. */
export function certificateIssuerAndSerial(certDer: Uint8Array): { issuer: Uint8Array; serial: Uint8Array } {
  const tbs = readChildren(readTlv(certDer).content)[0];
  if (!tbs || tbs.tag !== DER_TAG.SEQUENCE) throw new Error("Not a certificate");
  const fields = readChildren(tbs.content);
  let i = 0;
  if (fields[0]?.tag === 0xa0) i++; // [0] EXPLICIT version
  const serial = fields[i];
  const issuer = fields[i + 2]; // serialNumber, signature AlgorithmIdentifier, issuer
  if (serial?.tag !== DER_TAG.INTEGER || issuer?.tag !== DER_TAG.SEQUENCE) throw new Error("Not a certificate");
  return { issuer: issuer.raw, serial: serial.content };
}

export type Pkcs7Input = {
  /** What is signed (the manifest), not included in the output. */
  content: Uint8Array;
  /** The signer's certificate (DER). */
  signerCert: Uint8Array;
  /** The signer's RSA private key. */
  key: CryptoKey;
  /** Extra certificates to carry (the chain: Apple's WWDR intermediate). */
  certs?: Uint8Array[];
  /** The signingTime attribute. */
  now?: Date;
};

/** A detached CMS SignedData over `content`, DER-encoded: the `signature` file of a .pkpass. */
export async function pkcs7DetachedSignature({ content, signerCert, key, certs = [], now = new Date() }: Pkcs7Input): Promise<Uint8Array> {
  const digest = new Uint8Array(await subtle().digest("SHA-256", content as BufferSource));
  const attr = (id: string, value: Uint8Array) => sequence(oid(id), setOf(value));
  const signedAttrs = setOf(attr(OID.contentType, oid(OID.data)), attr(OID.signingTime, time(now)), attr(OID.messageDigest, octetString(digest)));
  const signature = new Uint8Array(await subtle().sign({ name: "RSASSA-PKCS1-v1_5" }, key, signedAttrs as BufferSource));
  const { issuer, serial } = certificateIssuerAndSerial(signerCert);
  const signerInfo = sequence(
    integer(1),
    sequence(issuer, integer(serial)),
    algorithm(OID.sha256),
    contextTag(0, signedAttrs, "implicit"),
    algorithm(OID.rsaEncryption),
    octetString(signature),
  );
  const signedData = sequence(
    integer(1),
    setOf(algorithm(OID.sha256)),
    sequence(oid(OID.data)),
    contextTag(0, setAsGiven(signerCert, ...certs), "implicit"),
    setOf(signerInfo),
  );
  return sequence(oid(OID.signedData), contextTag(0, signedData));
}
