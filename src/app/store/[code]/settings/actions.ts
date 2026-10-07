"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { WEEK, bool, hoursJson, readHours, str, type DayKey, type TradingHours } from "@/server/store/rules";
import { normalisePhone } from "@/lib/sa";
import { PushSub } from "@/lib/push-sub";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { actorOf } from "@/server/store/context";
import { removeStaffSubscription, saveStaffSubscription, STAFF_PUSH_ROLES, staffVapidKey } from "@/server/staff-push";
import { isEmail } from "@/lib/email";

export async function saveStoreDetails(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const phone = str(fd, "phone").slice(0, 20);
    if (phone && !/^[+\d][\d\s()-]{8,}$/.test(phone)) return fail("Enter the store's phone number, e.g. 012 345 6789", "phone");
    const email = str(fd, "email").toLowerCase().slice(0, 120);
    if (email && !isEmail(email)) return fail("That email address doesn't look right", "email");
    const whatsappRaw = str(fd, "whatsapp");
    const whatsapp = whatsappRaw ? normalisePhone(whatsappRaw) : null;
    if (whatsappRaw && !whatsapp) return fail("WhatsApp needs a South African mobile number", "whatsapp");
    const week = {} as TradingHours;
    for (const [k] of WEEK) week[k] = bool(fd, `closed:${k}`) ? null : { open: str(fd, `open:${k}`), close: str(fd, `close:${k}`) };
    const hours = hoursJson(week);
    if ("error" in hours) return fail(hours.error, "hours");
    const clickCollect = bool(fd, "clickCollect");
    const sameDay = bool(fd, "sameDay");
    await db.store.update({ where: { id: store.id }, data: { phone: phone || null, email: email || null, whatsapp, hours: hours.json, clickCollect, sameDay } });
    await audit(db, actor, "store.settings", { storeId: store.id, entity: "Store", entityId: store.id, data: { clickCollect, sameDay, hours: hours.json } });
    revalidatePath(`/store/${store.code}/settings`);
    return done("Store details saved. The website and store finder update straight away.");
  });
}

/** Saves one day's trading hours from the inline editor (the rest of the week is kept), with the same checks and audit entry as the details form. */
export async function saveHours(code: string, day: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const entry = WEEK.find(([k]) => k === day);
    if (!entry) return fail("Unknown day");
    const [k, name] = entry;
    const week = readHours(store.hours);
    week[k as DayKey] = bool(fd, "closed") ? null : { open: str(fd, "open"), close: str(fd, "close") };
    const hours = hoursJson(week);
    if ("error" in hours) return fail(hours.error, "hours");
    await db.store.update({ where: { id: store.id }, data: { hours: hours.json } });
    await audit(db, actor, "store.settings", { storeId: store.id, entity: "Store", entityId: store.id, data: { hours: hours.json, day: k } });
    revalidatePath(`/store/${store.code}/settings`);
    revalidatePath(`/store/${store.code}`);
    const d = week[k as DayKey];
    return done(d ? `${name}: ${d.open}–${d.close} saved. The website and store finder update straight away.` : `${name}: closed. The website and store finder update straight away.`);
  });
}

export async function revokeDevice(code: string, deviceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const d = await db.device.findFirst({ where: { id: deviceId, storeId: store.id } });
    if (!d) return fail("Device not found");
    if (!d.active) return fail("Already revoked");
    await db.device.update({ where: { id: d.id }, data: { active: false } });
    await db.session.deleteMany({ where: { deviceId: d.id } });
    await audit(db, actor, "device.revoke", { storeId: store.id, entity: "Device", entityId: d.id, data: { name: d.name, prefix: d.prefix } });
    revalidatePath(`/store/${store.code}/settings`);
    return done(`${d.name} can no longer trade. Pair it again from the POS if it was a mistake.`);
  });
}

// ── Notify me on this phone (staff Web Push) ─────────────────────────────────
/** Saves this phone's subscription for the signed-in staff member (managers, owners, area managers and HQ). */
export async function enableStaffPush(code: string, sub: unknown, userAgent: unknown): Promise<{ error?: string }> {
  const user = await requireStaff();
  await storeForUser(user, code);
  if (!STAFF_PUSH_ROLES.includes(user.role)) return { error: "Notifications are for managers, owners and area managers." };
  if (!staffVapidKey()) return { error: "Push notifications aren't set up on this server yet." };
  const p = PushSub.safeParse(sub);
  if (!p.success) return { error: "Your browser didn't send a complete subscription — please try again." };
  await saveStaffSubscription(user.id, p.data, typeof userAgent === "string" ? userAgent : null);
  await audit(db, actorOf(user), "staff_push.enable", { entity: "User", entityId: user.id, data: { endpoint: p.data.endpoint.slice(0, 60) } });
  revalidatePath(`/store/${code}/settings`);
  return {};
}

/** Forgets this phone's subscription. */
export async function disableStaffPush(code: string, endpoint: unknown): Promise<{ error?: string }> {
  const user = await requireStaff();
  await storeForUser(user, code);
  if (typeof endpoint === "string" && endpoint) await removeStaffSubscription(user.id, endpoint.slice(0, 1000));
  await audit(db, actorOf(user), "staff_push.disable", { entity: "User", entityId: user.id });
  revalidatePath(`/store/${code}/settings`);
  return {};
}
