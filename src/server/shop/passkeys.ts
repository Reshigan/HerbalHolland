"use server";
// Fingerprint / face sign-in for members (passkeys). Adding one needs a signed-in member; signing in with one
// starts the same 30-day session the phone code does. Challenges ride in a short-lived HMAC-signed cookie.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getCustomer, startSession } from "@/server/auth";
import { audit } from "@/server/audit";
import { appSecret } from "@/server/secret";
import { APP_URL } from "@/server/email-templates";
import { ALGS, checkClientData, fromB64u, PasskeyError, relyingParty, verifyAssertion } from "@/lib/passkey";
import { safePath } from "@/lib/safe-path";

const COOKIE = "hh_pk";
const TTL_MS = 3 * 60_000;
const mac = (body: string) => createHmac("sha256", appSecret()).update(`passkey:${body}`).digest("base64url");

async function issue(kind: "create" | "get") {
  const challenge = randomBytes(32).toString("base64url");
  const body = `${kind}.${challenge}.${Date.now() + TTL_MS}`;
  (await cookies()).set(COOKIE, `${body}.${mac(body)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_MS / 1000 });
  return challenge;
}

/** The challenge we issued for this ceremony, once: the cookie goes as soon as it's read. */
async function take(kind: "create" | "get") {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value ?? "";
  jar.delete(COOKIE);
  const i = v.lastIndexOf(".");
  const body = v.slice(0, i);
  const given = Buffer.from(v.slice(i + 1));
  const want = Buffer.from(mac(body));
  const [k, challenge, exp] = body.split(".");
  if (i < 0 || given.length !== want.length || !timingSafeEqual(given, want) || k !== kind || !(Number(exp) > Date.now())) throw new PasskeyError("This request expired. Try again");
  return challenge;
}

export type PasskeyResult = { ok: true; next?: string } | { ok: false; error: string };
const fail = (e: unknown): PasskeyResult => {
  if (e instanceof PasskeyError) return { ok: false, error: e.message };
  throw e;
};

export async function passkeyCreateOptions() {
  const c = await getCustomer();
  if (!c) return null;
  const { rpId } = relyingParty(APP_URL());
  const existing = await db.passkey.findMany({ where: { customerId: c.id }, select: { id: true } });
  return {
    challenge: await issue("create"),
    rp: { id: rpId, name: "Herbal Holland" },
    user: { id: Buffer.from(c.id).toString("base64url"), name: c.phone, displayName: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone },
    algs: [...ALGS],
    exclude: existing.map((p) => p.id),
  };
}

export async function savePasskey(r: { id: string; publicKey: string; alg: number; clientDataJSON: string; label?: string }): Promise<PasskeyResult> {
  try {
    const c = await getCustomer();
    if (!c) return { ok: false, error: "Sign in first" };
    if (!ALGS.includes(r.alg as (typeof ALGS)[number]) || !r.publicKey || !/^[\w-]{16,512}$/.test(r.id)) throw new PasskeyError("This phone's passkey type isn't supported");
    checkClientData(fromB64u(r.clientDataJSON), "webauthn.create", await take("create"), relyingParty(APP_URL()).origin);
    if ((await db.passkey.count({ where: { customerId: c.id } })) >= 10) throw new PasskeyError("You have 10 passkeys already. Remove one first");
    await db.passkey.upsert({ where: { id: r.id }, create: { id: r.id, customerId: c.id, publicKey: r.publicKey, alg: r.alg, label: r.label?.slice(0, 60) || null }, update: {} });
    await audit(db, { type: "CUSTOMER", id: c.id, name: c.firstName }, "customer.passkey_added", { entity: "Customer", entityId: c.id });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removePasskeys(): Promise<PasskeyResult> {
  const c = await getCustomer();
  if (!c) return { ok: false, error: "Sign in first" };
  await db.passkey.deleteMany({ where: { customerId: c.id } });
  await audit(db, { type: "CUSTOMER", id: c.id, name: c.firstName }, "customer.passkey_removed", { entity: "Customer", entityId: c.id });
  return { ok: true };
}

export async function passkeyGetOptions() {
  return { challenge: await issue("get"), rpId: relyingParty(APP_URL()).rpId };
}

export async function passkeySignIn(r: { id: string; authenticatorData: string; clientDataJSON: string; signature: string; next?: string }): Promise<PasskeyResult> {
  try {
    const challenge = await take("get");
    const key = /^[\w-]{16,512}$/.test(r.id) ? await db.passkey.findUnique({ where: { id: r.id }, include: { customer: { select: { id: true, firstName: true } } } }) : null;
    if (!key) throw new PasskeyError("This phone's passkey isn't linked to a membership any more. Sign in with your number");
    await verifyAssertion({ publicKey: key.publicKey, alg: key.alg, authenticatorData: fromB64u(r.authenticatorData), clientDataJSON: fromB64u(r.clientDataJSON), signature: fromB64u(r.signature), challenge, ...relyingParty(APP_URL()) });
    const now = new Date();
    await startSession("customer", { customerId: key.customerId }, 24 * 30);
    await db.passkey.update({ where: { id: key.id }, data: { lastUsedAt: now } });
    await db.customer.update({ where: { id: key.customerId }, data: { lastSeenAt: now } });
    await audit(db, { type: "CUSTOMER", id: key.customerId, name: key.customer.firstName }, "customer.sign_in", { entity: "Customer", entityId: key.customerId, data: { passkey: true } });
    return { ok: true, next: safePath(r.next) ?? "/club" };
  } catch (e) {
    return fail(e);
  }
}
