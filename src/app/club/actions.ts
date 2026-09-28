"use server";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { audit } from "@/server/audit";
import { setConsent } from "@/server/customers";
import { savePushSubscription, vapidPublicKey } from "@/server/push";
import type { MsgChannel } from "@/generated/prisma/client";
import { HOME_STORE_STATUSES } from "@/server/shop/context";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CHANNELS: MsgChannel[] = ["WHATSAPP", "SMS", "EMAIL", "PUSH"];

// `values` echoes what was submitted: React resets the form after the action, so the member's input survives an error.
export type ProfileState = { ok?: boolean; error?: string; fields?: Partial<Record<"firstName" | "email" | "homeStoreId", string>>; values?: Record<"firstName" | "lastName" | "email" | "homeStoreId", string> };

export async function updateProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const c = await getCustomer();
  if (!c) return { error: "Please sign in again" };
  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const homeStoreId = String(form.get("homeStoreId") ?? "");
  const fields: ProfileState["fields"] = {};
  if (!firstName || firstName.length > 60) fields.firstName = "Tell us your first name";
  if (email && !EMAIL.test(email)) fields.email = "That email address doesn't look right";
  const store = homeStoreId ? await db.store.findFirst({ where: { id: homeStoreId, kind: "RETAIL", status: { in: HOME_STORE_STATUSES } }, select: { id: true } }) : null;
  if (!store) fields.homeStoreId = "Choose your home store";
  const values = { firstName, lastName, email, homeStoreId };
  if (Object.keys(fields).length) return { fields, values };
  try {
    await db.customer.update({ where: { id: c.id }, data: { firstName, lastName: lastName || null, email: email || null, homeStoreId: store!.id } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { fields: { email: "That email is already linked to another member" }, values };
    throw e;
  }
  // Without an email address there is nowhere to send email marketing: withdraw that consent too.
  if (!email && c.consentEmail) await setConsent(c.id, "EMAIL", false, "CLUB_APP");
  await audit(db, { type: "CUSTOMER", id: c.id, name: firstName }, "customer.update_profile", {
    entity: "Customer", entityId: c.id, data: { emailChanged: (c.email ?? "") !== email, homeStoreChanged: c.homeStoreId !== store!.id },
  });
  refresh();
  return { ok: true };
}

/** POPIA s69: every change is written to the consent ledger with the wording shown. */
export async function setChannelConsent(channel: MsgChannel, granted: boolean): Promise<{ error?: string }> {
  const c = await getCustomer();
  if (!c) return { error: "Please sign in again" };
  if (!CHANNELS.includes(channel)) return { error: "Unknown channel" };
  if (channel === "EMAIL" && granted && !c.email) return { error: "Add an email address to your profile first" };
  await setConsent(c.id, channel, granted, "CLUB_APP");
  refresh();
  return {};
}

// ── App notifications (Web Push) ─────────────────────────────────────────────
const PushSub = z.object({
  endpoint: z.string().max(1000).refine((s) => s.startsWith("https://"), "Invalid endpoint"),
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
});

/** Saves this device's subscription and records consent to app notifications (POPIA ledger). */
export async function enablePush(sub: unknown): Promise<{ error?: string }> {
  const c = await getCustomer();
  if (!c) return { error: "Please sign in again" };
  if (!vapidPublicKey()) return { error: "App notifications aren't available yet" };
  const p = PushSub.safeParse(sub);
  if (!p.success) return { error: "Your browser didn't send a complete subscription — please try again" };
  await savePushSubscription(c.id, p.data);
  await setConsent(c.id, "PUSH", true, "CLUB_APP");
  refresh();
  return {};
}

/** Turns notifications off: forgets this device's subscription and withdraws app-notification consent. */
export async function disablePush(endpoint: string | null): Promise<{ error?: string }> {
  const c = await getCustomer();
  if (!c) return { error: "Please sign in again" };
  if (endpoint) await db.pushSubscription.deleteMany({ where: { customerId: c.id, endpoint: String(endpoint).slice(0, 1000) } });
  await setConsent(c.id, "PUSH", false, "CLUB_APP");
  refresh();
  return {};
}

// ── My Deals (POPIA s11(3): members may object to personalised offers) ───────
export async function setPersonalisedOffers(on: boolean): Promise<{ error?: string }> {
  const c = await getCustomer();
  if (!c) return { error: "Please sign in again" };
  await db.customer.update({ where: { id: c.id }, data: { personalisedOffers: !!on } });
  await audit(db, { type: "CUSTOMER", id: c.id, name: c.firstName }, "customer.personalised_offers", { entity: "Customer", entityId: c.id, data: { on: !!on } });
  refresh();
  return {};
}
