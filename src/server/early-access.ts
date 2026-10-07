// The herbalholland.com first-access list in the platform: imported once from the site's export (HQ → Marketing →
// Studio), told once by the shop-day message (a Studio post with the "early-access" audience), and each person deleted
// as soon as their message has gone (POPIA: kept no longer than its purpose). The do-not-contact list applies, and
// every message is logged like any other.
import { db } from "./db";
import { audit, type Actor } from "./audit";
import { senderFooter } from "./marketing";
import { sendBulk } from "./messaging";
import { parseEarlyAccess } from "@/lib/early-access";

export const earlyAccessCount = () => db.earlyAccessContact.count();

export async function importEarlyAccess(raw: string, actor: Actor) {
  const { rows, skipped } = parseEarlyAccess(raw);
  const r = await db.earlyAccessContact.createMany({ data: rows, skipDuplicates: true });
  await audit(db, actor, "studio.firstAccess.import", { data: { added: r.count, skipped, duplicates: rows.length - r.count } });
  return { added: r.count, skipped, duplicates: rows.length - r.count };
}

export async function clearEarlyAccess(actor: Actor) {
  const r = await db.earlyAccessContact.deleteMany({});
  await audit(db, actor, "studio.firstAccess.clear", { data: { deleted: r.count } });
  return r.count;
}

/**
 * The shop-day message: an email to everyone with an email address, or a text to everyone who gave only a mobile, so
 * each person hears once. {{firstName}} is filled. Anyone who's a member by then hears with the members instead, and the
 * do-not-contact list applies. Every sign-up it covers is deleted.
 */
export async function sendEarlyAccess(channel: "EMAIL" | "SMS", subject: string | null, body: string) {
  const people = await db.earlyAccessContact.findMany({ where: channel === "EMAIL" ? { email: { not: null } } : { email: null, mobile: { not: null } } });
  const to = (p: (typeof people)[number]) => (channel === "EMAIL" ? p.email! : p.mobile!);
  const blocked = new Set((await db.suppression.findMany({ where: { value: { in: people.map(to) }, OR: [{ channel: null }, { channel }] }, select: { value: true } })).map((s) => s.value));
  const found = await db.customer.findMany({ where: channel === "EMAIL" ? { email: { in: people.map(to), mode: "insensitive" } } : { phone: { in: people.map(to) } }, select: { email: true, phone: true } });
  const members = new Set(found.map((c) => (channel === "EMAIL" ? c.email!.toLowerCase() : c.phone)));
  const footer = await senderFooter(channel);
  const rows = people.filter((p) => !blocked.has(to(p)) && !members.has(to(p))).map((p) => ({ to: to(p), channel, subject: subject ?? undefined, body: body.replaceAll("{{firstName}}", p.firstName ?? "there") + footer }));
  const sent = await sendBulk(rows);
  await db.earlyAccessContact.deleteMany({ where: { id: { in: people.map((p) => p.id) } } });
  return { sent, suppressed: people.filter((p) => blocked.has(to(p))).length, members: people.filter((p) => !blocked.has(to(p)) && members.has(to(p))).length };
}
