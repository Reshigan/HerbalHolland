// Wallet passes for the Rewards card (pure builders; the routes in src/app/club/wallet sign and serve them).
// Apple Wallet: pass.json + manifest.json (SHA-1 of every file) + a PKCS#7 signature, zipped as a .pkpass.
// Google Wallet: a generic pass object inside a "Save to Google Wallet" JWT (RS256, the issuer's service account).
// The pass carries the member number (as the till's QR code), tier, points and first name, and nothing else personal.
import { createHash, createSign } from "node:crypto";

export type PassMember = { memberNo: string; firstName: string; tierName: string; points: number; founding?: number | null };

// ── Apple Wallet ──────────────────────────────────────────────────────────────
export type AppleConfig = { passTypeId: string; teamId: string; organizationName?: string; webServiceUrl?: string | null; authenticationToken?: string | null };
/** Holland orange on warm black, cream text: the brand tokens as Apple wants them. */
export const APPLE_COLORS = { backgroundColor: "rgb(12, 10, 9)", foregroundColor: "rgb(251, 247, 243)", labelColor: "rgb(245, 145, 60)" };
/** The files every .pkpass must carry (PassKit refuses a pass without an icon). */
export const APPLE_REQUIRED_FILES = ["pass.json", "manifest.json", "signature", "icon.png"] as const;

export function applePassJson(m: PassMember, c: AppleConfig, siteUrl: string) {
  const founding = m.founding ? [{ key: "founding", label: "FOUNDING MEMBER", value: `No. ${String(m.founding).padStart(4, "0")}` }] : [];
  return {
    formatVersion: 1,
    passTypeIdentifier: c.passTypeId,
    teamIdentifier: c.teamId,
    serialNumber: m.memberNo,
    organizationName: c.organizationName ?? "Herbal Holland",
    description: "Herbal Holland Rewards card",
    logoText: "Herbal Holland",
    ...APPLE_COLORS,
    sharingProhibited: true,
    barcodes: [{ format: "PKBarcodeFormatQR", message: m.memberNo, messageEncoding: "iso-8859-1", altText: m.memberNo }],
    storeCard: {
      headerFields: [{ key: "tier", label: "TIER", value: m.tierName }],
      primaryFields: [{ key: "points", label: "POINTS", value: m.points, numberStyle: "PKNumberStyleDecimal" }],
      secondaryFields: [
        { key: "member", label: "MEMBER", value: m.firstName },
        { key: "no", label: "MEMBER NO.", value: m.memberNo },
      ],
      auxiliaryFields: founding,
      backFields: [
        { key: "about", label: "Herbal Holland Rewards", value: "Show this card at the till to earn and spend points. 1 point = R1. Adults 18+." },
        { key: "manage", label: "Manage your card", value: `${siteUrl}/club` },
      ],
    },
    ...(c.webServiceUrl && c.authenticationToken ? { webServiceURL: c.webServiceUrl, authenticationToken: c.authenticationToken } : {}),
  };
}

/** manifest.json: the SHA-1 of every file in the pass, keyed by file name. */
export function appleManifest(files: Record<string, Uint8Array>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, createHash("sha1").update(bytes).digest("hex")]));
}

// ── A stored (uncompressed) ZIP: all a .pkpass needs, with no dependency ─────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // a fixed timestamp keeps the archive reproducible
const DOS_TIME = 0;
const utf8 = (s: string) => new TextEncoder().encode(s);

/** Files in the order given, method "stored", with a central directory: what `unzip` and PassKit both read. */
export function zipStore(files: Record<string, Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  for (const [name, data] of Object.entries(files)) {
    const n = utf8(name);
    const crc = crc32(data);
    const local = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...n]);
    parts.push(local, data);
    central.push(
      new Uint8Array([
        0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(data.length), ...u32(data.length),
        ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...n,
      ]),
    );
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const out = new Uint8Array(offset + cdSize + end.length);
  let at = 0;
  for (const p of [...parts, ...central, end]) (out.set(p, at), (at += p.length));
  return out;
}

// ── Google Wallet ─────────────────────────────────────────────────────────────
export type GoogleConfig = { issuerId: string; serviceAccountEmail: string; privateKeyPem: string; classSuffix?: string; origins?: string[] };
export const googleClassId = (c: Pick<GoogleConfig, "issuerId" | "classSuffix">) => `${c.issuerId}.${c.classSuffix ?? "herbal_holland_rewards"}`;
/** Object ids allow letters, digits, ".", "_" and "-": a member number is already that. */
export const googleObjectId = (c: Pick<GoogleConfig, "issuerId">, memberNo: string) => `${c.issuerId}.${memberNo.replace(/[^A-Za-z0-9._-]/g, "_")}`;

const text = (value: string) => ({ defaultValue: { language: "en", value } });

export function googleGenericClass(c: Pick<GoogleConfig, "issuerId" | "classSuffix">) {
  return { id: googleClassId(c), classTemplateInfo: undefined };
}

export function googleGenericObject(m: PassMember, c: Pick<GoogleConfig, "issuerId" | "classSuffix">, siteUrl: string) {
  return {
    id: googleObjectId(c, m.memberNo),
    classId: googleClassId(c),
    state: "ACTIVE",
    cardTitle: text("Herbal Holland Rewards"),
    header: text(m.firstName),
    subheader: text(`${m.tierName} member`),
    logo: { sourceUri: { uri: `${siteUrl}/pwa-icon/512` }, contentDescription: text("Herbal Holland") },
    hexBackgroundColor: "#0c0a09",
    barcode: { type: "QR_CODE", value: m.memberNo, alternateText: m.memberNo },
    textModulesData: [
      { id: "points", header: "Points", body: String(m.points) },
      { id: "member_no", header: "Member number", body: m.memberNo },
      ...(m.founding ? [{ id: "founding", header: "Founding Member", body: `No. ${String(m.founding).padStart(4, "0")}` }] : []),
    ],
    linksModuleData: { uris: [{ uri: `${siteUrl}/club`, description: "Manage your card", id: "manage" }] },
  };
}

/** The claims of a "Save to Google Wallet" JWT: the class and the object travel inside it, so nothing is pre-created. */
export function googleSaveJwtClaims(c: GoogleConfig, m: PassMember, siteUrl: string, now = new Date()) {
  return {
    iss: c.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(now.getTime() / 1000),
    origins: c.origins?.length ? c.origins : [siteUrl],
    payload: { genericClasses: [{ id: googleClassId(c) }], genericObjects: [googleGenericObject(m, c, siteUrl)] },
  };
}

export const base64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** RS256 with node:crypto (the service account's private key); no JWT library needed. */
export function signJwtRS256(claims: object, privateKeyPem: string) {
  const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(claims));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKeyPem);
  return `${head}.${body}.${base64url(sig)}`;
}

export const googleSaveUrl = (jwt: string) => `https://pay.google.com/gp/v/save/${jwt}`;
