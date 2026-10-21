// The herbalholland.com first-access list in the platform: imported once from the site's export (HQ → Marketing →
// Studio), told once by the shop-day message (a Studio post with the "early-access" audience), and each person deleted
// as soon as their message has gone (POPIA: kept no longer than its purpose). The do-not-contact list applies, and
// every message is logged like any other.
import { db } from "./db";
import { audit, type Actor } from "./audit";
import { senderFooter } from "./marketing";
import { sendBulk } from "./messaging";
import { parseEarlyAccess } from "@/lib/early-access";
import { inBatches } from "@/lib/json-list";

export const earlyAccessCount = () => db.earlyAccessContact.count();

export async function importEarlyAccess(raw: string, actor: Actor) {
  const { rows, skipped } = parseEarlyAccess(raw);
  // SQLite's createMany can't skip duplicates: leave out the emails and mobiles already on the list.
  const emails = rows.flatMap((r) => (r.email ? [r.email] : []));
  const mobiles = rows.flatMap((r) => (r.mobile ? [r.mobile] : []));
  const have = [
    ...(await inBatches(emails, (part) => db.earlyAccessContact.findMany({ where: { email: { in: part } }, select: { email: true, mobile: true } }))),
    ...(await inBatches(mobiles, (part) => db.earlyAccessContact.findMany({ where: { mobile: { in: part } }, select: { email: true, mobile: true } }))),
  ];
  const seenEmail = new Set(have.map((h) => h.email)), seenMobile = new Set(have.map((h) => h.mobile));
  const fresh = rows.filter((r) => !(r.email && seenEmail.has(r.email)) && !(r.mobile && seenMobile.has(r.mobile)) && (!r.email || seenEmail.add(r.email)) && (!r.mobile || seenMobile.add(r.mobile)));
  const r = await db.earlyAccessContact.createMany({ data: fresh });
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
  const blocked = new Set((await inBatches(people.map(to), (part) => db.suppression.findMany({ where: { value: { in: part }, OR: [{ channel: null }, { channel }] }, select: { value: true } }))).map((s) => s.value));
  const found = await inBatches(people.map(to), (part) => db.customer.findMany({ where: channel === "EMAIL" ? { email: { in: part } } : { phone: { in: part } }, select: { email: true, phone: true } }));
  const members = new Set(found.map((c) => (channel === "EMAIL" ? c.email!.toLowerCase() : c.phone)));
  const footer = await senderFooter(channel);
  const rows = people.filter((p) => !blocked.has(to(p)) && !members.has(to(p))).map((p) => ({ to: to(p), channel, subject: subject ?? undefined, body: body.replaceAll("{{firstName}}", p.firstName ?? "there") + footer }));
  const sent = await sendBulk(rows);
  await inBatches(people.map((p) => p.id), (part) => db.earlyAccessContact.deleteMany({ where: { id: { in: part } } }).then((r) => [r]));
  return { sent, suppressed: people.filter((p) => blocked.has(to(p))).length, members: people.filter((p) => !blocked.has(to(p)) && members.has(to(p))).length };
}
