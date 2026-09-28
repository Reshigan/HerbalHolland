"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { WEEK, bool, hoursJson, str, type TradingHours } from "@/server/store/rules";
import { normalisePhone } from "@/lib/sa";

export async function saveStoreDetails(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const phone = str(fd, "phone").slice(0, 20);
    if (phone && !/^[+\d][\d\s()-]{8,}$/.test(phone)) return fail("Enter the store's phone number, e.g. 012 345 6789", "phone");
    const email = str(fd, "email").toLowerCase().slice(0, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address doesn't look right", "email");
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
