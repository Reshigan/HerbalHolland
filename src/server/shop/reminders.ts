// "Remind me to reorder": a schedule the member sets on a product (coffee, collagen, oils…) — every N days we send
// one message with a one-tap link that puts the item in their bag. Nothing is charged: there's no card on file until
// Peach tokenisation is approved. Transactional (the member asked for exactly this), on the channel they chose, and
// cancelled from /club/reminders at any time.
import { cache } from "react";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { sha256 } from "@/server/crypto";
import { send, smsLink } from "@/server/messaging";
import { pushToCustomer } from "@/server/push";
import { getClasses } from "./access";
import { sms } from "@/lib/sms";
import { addDays } from "@/lib/format";
import type { ReminderChannel } from "@/generated/prisma/client";
import { appSecret } from "../secret";

export const REMINDER_DAYS = [14, 21, 30, 45, 60, 90] as const;
export const REMINDER_MAX = 20;
export const REMINDER_CHANNELS: { key: ReminderChannel; label: string }[] = [
  { key: "SMS", label: "SMS" },
  { key: "EMAIL", label: "Email" },
  { key: "PUSH", label: "App notification" },
];
export class ReminderError extends Error {}

/** The one-tap link carries a short signature, so a reminder id can't be guessed into someone's bag. */
export const reminderToken = (id: string) => sha256(`${appSecret()}:reminder:${id}`).slice(0, 20);
export const reorderPath = (id: string) => `/r/${id}/${reminderToken(id)}`;

type Member = { id: string; firstName: string; email: string | null };

export async function setReminder(customer: Member, variantId: string, everyDays: number, channel: ReminderChannel) {
  if (!REMINDER_DAYS.includes(everyDays as (typeof REMINDER_DAYS)[number])) throw new ReminderError("Choose how often we should remind you");
  const v = await db.variant.findUnique({ where: { id: variantId }, select: { id: true, active: true, product: { select: { name: true, status: true, regClass: true } } } });
  if (!v?.active || v.product.status !== "ACTIVE") throw new ReminderError("That item is no longer available");
  if ((await getClasses()).licensed.includes(v.product.regClass)) throw new ReminderError("Reminders aren't available for medicines");
  if (channel === "EMAIL" && !customer.email) throw new ReminderError("Add an email address in Settings first");
  if (channel === "PUSH" && !(await db.pushSubscription.count({ where: { customerId: customer.id } }))) throw new ReminderError("Turn on app notifications in Settings first");
  const existing = await db.reorderReminder.findUnique({ where: { customerId_variantId: { customerId: customer.id, variantId } } });
  if (!existing?.active && (await db.reorderReminder.count({ where: { customerId: customer.id, active: true } })) >= REMINDER_MAX) throw new ReminderError(`You can have up to ${REMINDER_MAX} reminders`);
  const nextAt = addDays(new Date(), everyDays);
  const r = await db.reorderReminder.upsert({
    where: { customerId_variantId: { customerId: customer.id, variantId } },
    create: { customerId: customer.id, variantId, everyDays, channel, nextAt },
    update: { everyDays, channel, nextAt, active: true },
  });
  await audit(db, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "reminder.set", { entity: "ReorderReminder", entityId: r.id, data: { variantId, everyDays, channel } });
  return r;
}

export async function cancelReminder(customer: Member, id: string) {
  const { count } = await db.reorderReminder.updateMany({ where: { id, customerId: customer.id, active: true }, data: { active: false } });
  if (count) await audit(db, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "reminder.cancel", { entity: "ReorderReminder", entityId: id });
  return count > 0;
}

/** The member's active reminder for a variant, if any. */
export const reminderFor = cache((customerId: string, variantId: string) => db.reorderReminder.findFirst({ where: { customerId, variantId, active: true } }));

export async function listReminders(customerId: string) {
  const rows = await db.reorderReminder.findMany({ where: { customerId, active: true }, orderBy: { nextAt: "asc" }, take: REMINDER_MAX });
  if (!rows.length) return [];
  const variants = await db.variant.findMany({ where: { id: { in: rows.map((r) => r.variantId) } }, select: { id: true, name: true, product: { select: { name: true, slug: true, strain: true, regClass: true } } } });
  const byId = new Map(variants.map((v) => [v.id, v]));
  return rows.flatMap((r) => {
    const v = byId.get(r.variantId);
    return v ? [{ ...r, variant: v }] : [];
  });
}

/** The daily job: every reminder that fell due gets its message and moves on by its interval. Bounded to 500 a run. */
export async function sendDueReminders(now = new Date()) {
  const due = await db.reorderReminder.findMany({ where: { active: true, nextAt: { lte: now } }, orderBy: { nextAt: "asc" }, take: 500 });
  let sent = 0, failed = 0, stopped = 0;
  for (const r of due) {
    try {
      const [c, v] = await Promise.all([
        db.customer.findUnique({ where: { id: r.customerId }, select: { id: true, firstName: true, phone: true, email: true } }),
        db.variant.findUnique({ where: { id: r.variantId }, select: { name: true, active: true, product: { select: { name: true, status: true } } } }),
      ]);
      if (!c || !v?.active || v.product.status !== "ACTIVE") {
        await db.reorderReminder.update({ where: { id: r.id }, data: { active: false } });
        stopped++;
        continue;
      }
      const path = reorderPath(r.id);
      const item = `${v.product.name} (${v.name})`;
      const body = `Time to reorder ${item}? One tap adds it to your bag: ${smsLink(path)} - Manage reminders: ${smsLink("/club/reminders")}`;
      if (r.channel === "PUSH") await pushToCustomer(c.id, { title: "Time to reorder?", body: `${item}: tap to add it to your bag.`, url: path });
      else if (r.channel === "EMAIL" && c.email)
        await send({ channel: "EMAIL", to: c.email, subject: `Time to reorder ${v.product.name}?`, body: `Hi ${c.firstName}, you asked us to remind you every ${r.everyDays} days. ${body}`, kind: "TRANSACTIONAL", customerId: c.id, url: smsLink(path) });
      else await send({ channel: "SMS", to: c.phone, body: sms(body), kind: "TRANSACTIONAL", customerId: c.id });
      await db.reorderReminder.update({ where: { id: r.id }, data: { lastSentAt: now, nextAt: addDays(now, r.everyDays) } });
      sent++;
    } catch (e) {
      failed++;
      console.error("[reminders]", r.id, e);
    }
  }
  return { due: due.length, sent, failed, stopped };
}
