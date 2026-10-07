// The Rewards card in Apple Wallet and Google Wallet. Pure builders live in @/lib/wallet; this file reads the
// configuration, draws the icons, signs (Apple: PKCS#7 through the openssl CLI, as node:crypto has no CMS; Google:
// RS256 with node:crypto) and says clearly when a wallet isn't set up yet. The pass holds the member number (QR),
// tier, points and first name, and no other personal data.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { appIcon } from "@/components/brand/app-icon";
import { APP_URL } from "@/server/invoices";
import { tierMeta } from "./club";
import { applePassJson, appleManifest, googleSaveJwtClaims, googleSaveUrl, signJwtRS256, zipStore, type PassMember } from "@/lib/wallet";

const run = promisify(execFile);
export class WalletError extends Error {}

const pem = (s: string | undefined) => (s ?? "").replace(/\\n/g, "\n").trim();

export type AppleWallet = { passTypeId: string; teamId: string; certPem: string; keyPem: string; wwdrPem: string };
export type GoogleWallet = { issuerId: string; serviceAccountEmail: string; privateKeyPem: string };

/** What the environment provides: WALLET_APPLE_* (pass type id, team id, three PEMs) and WALLET_GOOGLE_* (issuer id, service-account JSON). */
export function walletConfig(): { apple: AppleWallet | null; google: GoogleWallet | null } {
  const e = process.env;
  const apple =
    e.WALLET_APPLE_PASS_TYPE_ID && e.WALLET_APPLE_TEAM_ID && e.WALLET_APPLE_CERT_PEM && e.WALLET_APPLE_KEY_PEM && e.WALLET_APPLE_WWDR_PEM
      ? { passTypeId: e.WALLET_APPLE_PASS_TYPE_ID, teamId: e.WALLET_APPLE_TEAM_ID, certPem: pem(e.WALLET_APPLE_CERT_PEM), keyPem: pem(e.WALLET_APPLE_KEY_PEM), wwdrPem: pem(e.WALLET_APPLE_WWDR_PEM) }
      : null;
  let google: GoogleWallet | null = null;
  if (e.WALLET_GOOGLE_ISSUER_ID && e.WALLET_GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const sa = JSON.parse(e.WALLET_GOOGLE_SERVICE_ACCOUNT_JSON) as { client_email?: string; private_key?: string };
      if (sa.client_email && sa.private_key) google = { issuerId: e.WALLET_GOOGLE_ISSUER_ID, serviceAccountEmail: sa.client_email, privateKeyPem: sa.private_key };
    } catch {
      google = null;
    }
  }
  return { apple, google };
}

/** Which wallet buttons to show on the Rewards card. */
export function walletAvailable() {
  const c = walletConfig();
  return { apple: !!c.apple, google: !!c.google };
}

export const passMember = (c: { memberNo: string; firstName: string; tier: string; points: number; foundingNo: number | null }): PassMember => ({
  memberNo: c.memberNo, firstName: c.firstName, tierName: tierMeta(c.tier).name, points: c.points, founding: c.foundingNo,
});

const iconPng = async (px: number) => new Uint8Array(await appIcon("rewards", px, 0.12).arrayBuffer());

/** The signed .pkpass bytes. */
export async function buildApplePass(m: PassMember): Promise<Uint8Array> {
  const c = walletConfig().apple;
  if (!c) throw new WalletError("Apple Wallet isn't set up yet");
  const enc = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    "pass.json": enc.encode(JSON.stringify(applePassJson(m, c, APP_URL()))),
    "icon.png": await iconPng(58), "icon@2x.png": await iconPng(116), "icon@3x.png": await iconPng(174),
    "logo.png": await iconPng(50), "logo@2x.png": await iconPng(100),
  };
  const manifest = enc.encode(JSON.stringify(appleManifest(files)));
  const signature = await signManifest(manifest, c);
  return zipStore({ ...files, "manifest.json": manifest, signature });
}

/** PKCS#7 detached signature over manifest.json with the pass certificate, chained to Apple's WWDR certificate. */
async function signManifest(manifest: Uint8Array, c: AppleWallet) {
  const dir = await mkdtemp(join(tmpdir(), "hh-pass-"));
  try {
    const f = (name: string) => join(dir, name);
    await Promise.all([writeFile(f("cert.pem"), c.certPem), writeFile(f("key.pem"), c.keyPem, { mode: 0o600 }), writeFile(f("wwdr.pem"), c.wwdrPem), writeFile(f("manifest.json"), manifest)]);
    await run("openssl", ["smime", "-binary", "-sign", "-certfile", f("wwdr.pem"), "-signer", f("cert.pem"), "-inkey", f("key.pem"), "-in", f("manifest.json"), "-out", f("signature"), "-outform", "DER"]);
    return new Uint8Array(await readFile(f("signature")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new WalletError("openssl isn't installed on this server: Apple passes need it to sign the manifest (PKCS#7)");
    throw new WalletError(`Signing the pass failed: ${String((e as Error).message).slice(0, 200)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The "Save to Google Wallet" link: the pass travels inside a signed JWT, so nothing is created ahead of time. */
export function googleSaveLink(m: PassMember) {
  const c = walletConfig().google;
  if (!c) throw new WalletError("Google Wallet isn't set up yet");
  return googleSaveUrl(signJwtRS256(googleSaveJwtClaims(c, m, APP_URL()), c.privateKeyPem));
}
