"use server";
// Storefront server actions shared across pages: age gate, preferred store, the bag,
// promo codes and the phone-OTP sign-in / one-step registration flow.
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { endSession, getCustomer, startSession } from "@/server/auth";
import { audit } from "@/server/audit";
import { quote } from "@/server/pricing";
import { createCustomer, CustomerError, recordAgeCheck, requestOtp, verifyOtp } from "@/server/customers";
import { getDispensaryAccess, getClasses } from "./access";
import { getCart, getRetailStores, HOME_STORE_STATUSES, saveAge, saveCart, savePreferredStore, savePromoCode, SHOP_COOKIE } from "./context";
import { openState, parseHours } from "./hours";
import { cartCount, withItem, withQty } from "./cart-codec";
import { readPhoneToken, signPhone } from "./phone-token";
import { checkSaId } from "@/lib/sa";
import type { MsgChannel } from "@/generated/prisma/client";
import type { PickerStore } from "@/components/shop/nav-client";

/** Only same-site relative paths are accepted as post-sign-in destinations. */
function safeNext(raw: FormDataEntryValue | null) {
  const s = String(raw ?? "");
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") ? s : null;
}

// ── Age gate ─────────────────────────────────────────────────────────────────
export async function confirmAge() {
  await saveAge(true);
}
export async function declineAge() {
  await saveAge(false);
}

// ── Preferred store ──────────────────────────────────────────────────────────
export async function choosePreferredStore(code: string) {
  const store = await db.store.findFirst({ where: { code, kind: "RETAIL", status: "ACTIVE" }, select: { code: true } });
  if (!store) return { error: "That store isn't trading yet" };
  await savePreferredStore(store.code);
  return { ok: true as const };
}

/** The store picker's list, fetched when the picker opens — too big to put on every page at network scale. */
export async function pickerStores(): Promise<PickerStore[]> {
  return (await getRetailStores()).map((s) => {
    const o = openState(parseHours(s.hours));
    return { code: s.code, name: s.name, suburb: s.suburb, city: s.city, province: s.province, lat: s.lat, lng: s.lng, status: s.status, sameDay: s.sameDay, open: o.open, openLabel: o.label };
  });
}

// ── Bag ──────────────────────────────────────────────────────────────────────
export type BagState = { ok?: boolean; error?: string; message?: string; count?: number; at?: number };

export async function addToBag(_: BagState, form: FormData): Promise<BagState> {
  const variantId = String(form.get("variantId") ?? "");
  const qty = Math.max(1, Math.min(20, Math.floor(Number(form.get("qty") ?? 1)) || 1));
  const v = await db.variant.findUnique({ where: { id: variantId }, include: { product: { select: { name: true, status: true, regClass: true } } } });
  if (!v?.active || v.product.status !== "ACTIVE") return { error: "That item is no longer available" };
  const classes = await getClasses();
  if (classes.licensed.includes(v.product.regClass)) {
    const access = await getDispensaryAccess();
    if (!access.allowed) return { error: access.mode === "MEDICAL" ? "Dispensary items are for registered patients — sign in first" : "Sign in and verify your age to order this item" };
  }
  const items = withItem(await getCart(), v.id, qty);
  await saveCart(items);
  return { ok: true, message: `${v.product.name} · ${v.name} added`, count: cartCount(items), at: Date.now() };
}

export async function setBagQty(form: FormData) {
  const variantId = String(form.get("variantId") ?? "");
  const qty = Math.floor(Number(form.get("qty") ?? 0));
  if (!variantId || !Number.isFinite(qty)) return;
  await saveCart(withQty(await getCart(), variantId, qty));
}

export type PromoState = { error?: string; ok?: boolean };

export async function applyPromoCode(_: PromoState, form: FormData): Promise<PromoState> {
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Enter a code" };
  if (!/^[A-Z0-9-]{3,32}$/.test(code)) return { error: "That code isn't valid right now" };
  const customer = await getCustomer();
  const q = await quote({ channel: "ONLINE", items: await getCart(), code, customerId: customer?.id });
  if (q.codeError) return { error: q.codeError };
  await savePromoCode(code);
  return { ok: true };
}

export async function removePromoCode() {
  await savePromoCode(null);
}

// ── Sign in / join (phone OTP → one short registration step) ────────────────
type Field = "phone" | "code" | "firstName" | "email" | "idNumber" | "dob" | "homeStoreId" | "accept";
export type AuthState = {
  step: "phone" | "code" | "register" | "done";
  phone?: string;
  demoCode?: string;
  error?: string;
  fields?: Partial<Record<Field, string>>;
  values?: Record<string, string>;
};

const CHANNELS: MsgChannel[] = ["WHATSAPP", "SMS", "EMAIL", "PUSH"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function authFlow(prev: AuthState, form: FormData): Promise<AuthState> {
  const intent = String(form.get("intent") ?? "");
  const next = safeNext(form.get("next"));
  const jar = await cookies();

  if (intent === "restart") {
    jar.delete(SHOP_COOKIE.phone);
    return { step: "phone" };
  }

  if (intent === "send") {
    const raw = String(form.get("phone") ?? "");
    try {
      const r = await requestOtp(raw);
      return { step: "code", phone: r.phone, demoCode: r.demoCode };
    } catch (e) {
      // Resending from the code step keeps the member where they are; a first send shows the error on the number.
      if (e instanceof CustomerError) return prev.step === "code" ? { ...prev, error: e.message, fields: undefined } : { step: "phone", fields: { phone: e.message }, values: { phone: raw } };
      throw e;
    }
  }

  if (intent === "verify") {
    const phone = prev.phone ?? String(form.get("phone") ?? "");
    const code = String(form.get("code") ?? "").replace(/\D/g, "");
    if (code.length !== 6) return { ...prev, step: "code", error: undefined, fields: { code: "Enter the 6-digit code we sent you" } };
    try {
      const r = await verifyOtp(phone, code);
      if (r.customer) {
        await startSession("customer", { customerId: r.customer.id }, 24 * 30);
        await db.customer.update({ where: { id: r.customer.id }, data: { lastSeenAt: new Date() } });
        await audit(db, { type: "CUSTOMER", id: r.customer.id, name: r.customer.firstName }, "customer.sign_in", { entity: "Customer", entityId: r.customer.id });
        if (next) redirect(next);
        return { step: "done" };
      }
      jar.set(SHOP_COOKIE.phone, signPhone(r.phone), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 20 * 60 });
      return { step: "register", phone: r.phone };
    } catch (e) {
      if (e instanceof CustomerError) return { ...prev, step: "code", error: undefined, fields: { code: e.message } };
      throw e;
    }
  }

  if (intent === "register") {
    const phone = readPhoneToken(jar.get(SHOP_COOKIE.phone)?.value);
    if (!phone) return { step: "phone", error: "Your verification expired — please confirm your number again" };
    // Everything comes back with an error, ticks too: React resets the form after the action, and a lost opt-in goes unnoticed.
    const v = Object.fromEntries(["firstName", "email", "idType", "idNumber", "dob", "homeStoreId", "ref", "accept", ...CHANNELS.map((ch) => `consent_${ch}`)].map((k) => [k, String(form.get(k) ?? "").trim()]));
    v.interests = form.getAll("interest").map(String).join(" ");
    const fields: AuthState["fields"] = {};
    if (!v.firstName || v.firstName.length > 60) fields.firstName = "Tell us your first name";
    if (v.email && !EMAIL.test(v.email)) fields.email = "That email address doesn't look right";
    let dob: Date | undefined;
    if (v.idType === "passport") {
      dob = /^\d{4}-\d{2}-\d{2}$/.test(v.dob) ? new Date(`${v.dob}T00:00:00Z`) : undefined;
      if (!dob || Number.isNaN(dob.getTime()) || dob.getUTCFullYear() < 1900) fields.dob = "Enter your date of birth";
    } else {
      const id = checkSaId(v.idNumber);
      if (!id.valid) fields.idNumber = v.idNumber ? id.reason : "Enter your 13-digit SA ID number";
    }
    const store = v.homeStoreId ? await db.store.findFirst({ where: { id: v.homeStoreId, kind: "RETAIL", status: { in: HOME_STORE_STATUSES } }, select: { id: true } }) : null;
    if (!store) fields.homeStoreId = "Choose your home store";
    if (form.get("accept") !== "on") fields.accept = "Please confirm you're 18 or older and accept the terms";
    if (Object.keys(fields).length) return { step: "register", phone, fields, values: v };

    const referrer = v.ref ? await db.customer.findUnique({ where: { referralCode: v.ref.toUpperCase() }, select: { id: true } }) : null;
    try {
      const c = await createCustomer(
        {
          phone,
          firstName: v.firstName,
          email: v.email || undefined,
          idNumber: v.idType === "passport" ? undefined : v.idNumber,
          dob: v.idType === "passport" ? dob : undefined,
          homeStoreId: store!.id,
          referralCode: referrer ? v.ref : undefined,
          consents: Object.fromEntries(CHANNELS.map((ch) => [ch, form.get(`consent_${ch}`) === "on"])),
          source: referrer ? "REFERRAL" : "WEB",
          joinedVia: String(form.get("src") ?? ""),
          termsAccepted: form.get("accept") === "on",
          interests: form.getAll("interest").map(String),
        },
        { type: "CUSTOMER", name: v.firstName },
      );
      jar.delete(SHOP_COOKIE.phone);
      await startSession("customer", { customerId: c.id }, 24 * 30);
      await audit(db, { type: "CUSTOMER", id: c.id, name: c.firstName }, "customer.sign_in", { entity: "Customer", entityId: c.id, data: { firstVisit: true } });
    } catch (e) {
      if (e instanceof CustomerError) {
        const msg = e.message;
        const field: Field | null = /ID number|Check digit|citizenship|13 digits|date of birth in id/i.test(msg) ? "idNumber" : /adults/i.test(msg) ? (v.idType === "passport" ? "dob" : "idNumber") : null;
        return field ? { step: "register", phone, fields: { [field]: msg }, values: v } : { step: "register", phone, error: msg, values: v };
      }
      if ((e as { code?: string }).code === "P2002") return { step: "register", phone, fields: { email: "That email is already linked to another member" }, values: v };
      throw e;
    }
    // New members land with a welcome message wherever they were heading.
    if (next) {
      const u = new URL(next, "http://local");
      u.searchParams.set("welcome", "1");
      redirect(`${u.pathname}${u.search}${u.hash}`);
    }
    return { step: "done" };
  }

  return prev;
}

export async function signOut() {
  const c = await getCustomer();
  await endSession("customer");
  if (c) await audit(db, { type: "CUSTOMER", id: c.id, name: c.firstName }, "customer.sign_out", { entity: "Customer", entityId: c.id });
  redirect("/");
}

// ── Age verification (SA ID number: format, checksum and 18+ from the date of birth) ─
export type AgeCheckState = { ok?: boolean; error?: string };

export async function verifyAgeWithId(_: AgeCheckState, form: FormData): Promise<AgeCheckState> {
  const c = await getCustomer();
  if (!c) return { error: "Please sign in again" };
  const idNumber = String(form.get("idNumber") ?? "").replace(/\s/g, "");
  const id = checkSaId(idNumber);
  if (!id.valid) return { error: idNumber ? id.reason : "Enter your 13-digit SA ID number" };
  try {
    await recordAgeCheck(c.id, "ID_NUMBER", { type: "CUSTOMER", id: c.id, name: c.firstName }, idNumber);
  } catch (e) {
    if (e instanceof CustomerError) return { error: e.message };
    if ((e as { code?: string }).code === "P2002") return { error: "That ID number is already linked to another member — please visit a store so we can help." };
    throw e;
  }
  refresh();
  return { ok: true };
}
