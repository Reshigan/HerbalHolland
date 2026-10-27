// The morning membership email (job `morning`, 05:00 SAST) to MEMBERSHIP_DIGEST_TO (comma-separated addresses).
// Once a day per recipient: each address is marked sent (a push-event key) only after its email goes, so a re-run after a
// failure sends to whoever is still owed and never twice to anyone (the cron route runs one job at a time).
import { db } from "./db";
import { emailLayout, esc, sendEmail } from "./email";
import { claimEvents } from "./staff-push";
import { dayKey, fmtDate, fmtDateTime } from "@/lib/format";
import { membershipDigestText } from "@/lib/membership-digest";

const LIST = 50;

export async function sendMembershipDigest(now = new Date()) {
  const to = (process.env.MEMBERSHIP_DIGEST_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const key = (address: string) => `membership-digest:${dayKey(now)}:${address}`;
  const done = new Set((await db.staffPushEvent.findMany({ where: { key: { in: to.map(key) } }, select: { key: true } })).map((e) => e.key));
  const owed = to.filter((a) => !done.has(key(a)));
  if (!owed.length) return { sent: 0 };
  const since = new Date(now.getTime() - 24 * 60 * 60_000);
  const [total, verified, newCount, joined, sources] = await Promise.all([
    db.customer.count(),
    db.customer.count({ where: { ageVerifiedAt: { not: null } } }),
    db.customer.count({ where: { createdAt: { gte: since } } }),
    db.customer.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: LIST, select: { memberNo: true, firstName: true, lastName: true, joinedVia: true, createdAt: true } }),
    db.customer.groupBy({ by: ["joinedVia"], _count: { _all: true } }),
  ]);
  const { subject, text } = membershipDigestText({
    day: fmtDate(now),
    total,
    verified,
    newCount,
    joined: joined.map((c) => ({ memberNo: c.memberNo, name: `${c.firstName} ${(c.lastName ?? "").slice(0, 1)}.`.trim(), joinedVia: c.joinedVia, at: fmtDateTime(c.createdAt) })),
    bySource: sources.map((s) => ({ source: s.joinedVia ?? "", members: s._count._all })).sort((a, b) => b.members - a.members),
  });
  const html = emailLayout({ preheader: subject, eyebrow: "Membership", heading: subject, body: `<pre style="margin:0 0 16px;font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${esc(text)}</pre>`, footerHtml: "You received this because your address is the shop's MEMBERSHIP_DIGEST_TO." });
  for (const address of owed) {
    await sendEmail({ to: address, subject, text, html });
    await claimEvents([key(address)]);
  }
  return { sent: owed.length, members: total, new: newCount };
}
