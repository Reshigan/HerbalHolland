"use server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { PushSub } from "@/lib/push-sub";
import { db } from "@/server/db";
import { getCustomer, getStaff } from "@/server/auth";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/hq/guard";
import { INSIGHT_ROLES } from "@/server/insights";
import { COLLISION_REFUSED, collisionsUsedUp, noteCollision, setConsent } from "@/server/customers";
import { savePushSubscription, vapidPublicKey } from "@/server/push";
import type { MsgChannel } from "@/generated/prisma/client";
import { HOME_STORE_STATUSES } from "@/server/shop/context";
import { isEmail } from "@/lib/email";
import { sealMember } from "@/lib/partner-token";
import { partnerKey, recordLink, shareWording } from "@/server/partners";

const CHANNELS: MsgChannel[] = ["WHATSAPP", "SMS", "EMAIL", "PUSH"];

// `values` echoes what was submitted: React resets the form after the action, so the member's input survives an error.
export type ProfileState = { ok?: boolean; error?: string; fields?: Partial<Record<"firstName" | "email" | "homeStoreId", string>>; values?: Record<"firstName" | "lastName" | "email" | "homeStoreId", string> };

/**
 * Keeps the Sales and Members tabs on this card after the staff sign-in ends. Owners and HQ aren't on a store's team
 * page, so they link their own card here, signed in both ways on the one phone. The figures still ask for a staff login.
 */
export async function linkOwnerCard() {
  const [c, staff] = await Promise.all([getCustomer(), getStaff()]);
  if (!c || !staff || !INSIGHT_ROLES.includes(staff.role) || staff.memberId) return;
  if (await db.user.findUnique({ where: { memberId: c.id }, select: { id: true } })) return;
  await db.user.update({ where: { id: staff.id }, data: { memberId: c.id } });
  await audit(db, actorOf(staff), "staff.member_link", { entity: "User", entityId: staff.id, data: { name: staff.name, memberNo: c.memberNo, before: null } });
  refresh();
}

export async function updateProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const c = await getCustomer();
  if (!c) return { error: "Please sign in again" };
  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const homeStoreId = String(form.get("homeStoreId") ?? "");
  const fields: ProfileState["fields"] = {};
  if (!firstName || firstName.length > 60) fields.firstName = "Tell us your first name";
  if (email && !isEmail(email)) fields.email = "That email address doesn't look right";
  const store = homeStoreId ? await db.store.findFirst({ where: { id: homeStoreId, kind: "RETAIL", status: { in: HOME_STORE_STATUSES } }, select: { id: true } }) : null;
  if (!store) fields.homeStoreId = "Choose your home store";
  const values = { firstName, lastName, email, homeStoreId };
  if (Object.keys(fields).length) return { fields, values };
  // "Already linked to another member" says who's a member: a few a day, then nothing more is checked (customers.ts).
  const emailChanging = !!email && email !== (c.email ?? "");
  if (emailChanging && (await collisionsUsedUp(`member:${c.id}`))) return { fields: { email: COLLISION_REFUSED }, values };
  try {
    await db.customer.update({ where: { id: c.id }, data: { firstName, lastName: lastName || null, email: email || null, ...(emailChanging || !email ? { emailVerifiedAt: null } : {}), homeStoreId: store!.id } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const allowed = await noteCollision(`member:${c.id}`, { type: "CUSTOMER", id: c.id, name: c.firstName }, "email");
      return { fields: { email: allowed ? "That email is already linked to another member" : COLLISION_REFUSED }, values };
    }
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
/** Saves this device's subscription and records consent to app notifications (POPIA ledger). */
export async function enablePush(sub: unknown): Promise<{ error?: string }> {
  const c = await getCustomer();
  if (!c) return { error: "Please sign in again" };
  if (!vapidPublicKey()) return { error: "App notifications aren't available yet" };
  const p = PushSub.safeParse(sub);
  if (!p.success) return { error: "Your browser didn't send a complete subscription. Please try again." };
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

/** The member's own tap: records what they agreed to and carries them to the partner's join page, details sealed. */
export async function shareWithPartner(partnerId: string) {
  const c = await getCustomer();
  if (!c) redirect("/club/join?next=/club/partners");
  const p = await db.partnerBrand.findFirst({ where: { id: partnerId, active: true, joinUrl: { not: null } } });
  if (!p?.joinUrl) return refresh();
  await recordLink(c, p, "OUT", { wording: shareWording(p.name) });
  const token = sealMember({ firstName: c.firstName, lastName: c.lastName ?? undefined, phone: c.phone, email: c.email ?? undefined, externalId: c.memberNo }, partnerKey(p), Math.floor(Date.now() / 1000) + 3600);
  const url = new URL(p.joinUrl);
  url.searchParams.set("t", token);
  redirect(url.toString());
}

/** Stops future sharing. What the partner already has stays with them, and the page says so. */
export async function stopSharing(partnerId: string) {
  const c = await getCustomer();
  if (!c) redirect("/club/join?next=/club/partners");
  const r = await db.partnerLink.updateMany({ where: { customerId: c.id, partnerId, direction: "OUT", revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count) await audit(db, { type: "CUSTOMER", id: c.id, name: c.firstName }, "partner.revoke", { entity: "PartnerBrand", entityId: partnerId });
  refresh();
}
