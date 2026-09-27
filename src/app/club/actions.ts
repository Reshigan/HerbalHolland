"use server";
import { refresh } from "next/cache";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { audit } from "@/server/audit";
import { setConsent } from "@/server/customers";
import type { MsgChannel } from "@/generated/prisma/client";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CHANNELS: MsgChannel[] = ["WHATSAPP", "SMS", "EMAIL", "PUSH"];

export type ProfileState = { ok?: boolean; error?: string; fields?: Partial<Record<"firstName" | "email" | "homeStoreId", string>> };

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
  const store = homeStoreId ? await db.store.findFirst({ where: { id: homeStoreId, kind: "RETAIL", status: "ACTIVE" }, select: { id: true } }) : null;
  if (!store) fields.homeStoreId = "Choose a trading store";
  if (Object.keys(fields).length) return { fields };
  try {
    await db.customer.update({ where: { id: c.id }, data: { firstName, lastName: lastName || null, email: email || null, homeStoreId: store!.id } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { fields: { email: "That email is already linked to another member" } };
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
