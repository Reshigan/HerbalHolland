// In-store events (opening weekends, members' evenings) for the HQ console and the store back office:
// form validation, RSVP counts, the RSVP list and the door list. RSVPs and check-in live in server/events.ts.
import { db } from "@/server/db";
import { str, parseInt10, parseLocal, slugify, toLocalInput } from "@/server/hq/form";
import { screenCopy } from "@/lib/compliance";
import { csvFilename, toCsv } from "@/lib/csv";
import { dayKey } from "@/lib/format";
import type { Prisma, StoreEvent } from "@/generated/prisma/client";
import type { EventValues } from "@/components/hq/event-form";

export type EventData = { title: string; slug: string; blurb: string; startsAt: Date; endsAt: Date; capacity: number };

/** Validates the event form. Capacity can't drop below the tickets already issued. */
export async function readEvent(fd: FormData, before: StoreEvent | null, now = new Date()): Promise<{ data: EventData } | { fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  const title = str(fd, "title");
  if (title.length < 3 || title.length > 80) fields.title = "3–80 characters";
  const slug = (str(fd, "slug") || slugify(title)).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 80) fields.slug = "Lowercase letters, numbers and dashes (3–80)";
  else if (await db.storeEvent.count({ where: { slug, ...(before && { id: { not: before.id } }) } })) fields.slug = "Another event uses this address";
  const blurb = str(fd, "blurb");
  if (blurb.length < 10 || blurb.length > 500) fields.blurb = "10–500 characters";
  const flag = screenCopy(`${title} ${blurb}`)[0];
  if (flag) fields.blurb = `“${flag.term}”: ${flag.reason}`;
  const startsAt = parseLocal(str(fd, "startsAt"));
  const endsAt = parseLocal(str(fd, "endsAt"));
  if (!startsAt) fields.startsAt = "Pick the start date and time";
  else if (!before && startsAt <= now) fields.startsAt = "Must be in the future";
  if (!endsAt) fields.endsAt = "Pick the end date and time";
  else if (startsAt && endsAt <= startsAt) fields.endsAt = "Must end after it starts";
  else if (startsAt && endsAt.getTime() - startsAt.getTime() > 7 * 86_400_000) fields.endsAt = "Events run 7 days at most";
  const capacity = parseInt10(str(fd, "capacity"));
  if (capacity == null || capacity < 1 || capacity > 5_000) fields.capacity = "1 to 5,000 people";
  else if (before) {
    const taken = await db.rsvp.count({ where: { eventId: before.id } });
    if (capacity < taken) fields.capacity = `${taken.toLocaleString()} members already hold tickets, so capacity can't go below that`;
  }
  if (Object.keys(fields).length) return { fields };
  return { data: { title, slug, blurb, startsAt: startsAt!, endsAt: endsAt!, capacity: capacity! } };
}

/** Form values: an existing event, or a new one on the coming Saturday, 10:00–14:00. */
export function eventValues(e: StoreEvent | null, storeId = ""): EventValues {
  if (e) return { storeId: e.storeId, title: e.title, slug: e.slug, blurb: e.blurb, startsAt: toLocalInput(e.startsAt), endsAt: toLocalInput(e.endsAt), capacity: String(e.capacity) };
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
  const day = dayKey(d);
  return { storeId, title: "", slug: "", blurb: "", startsAt: `${day}T10:00`, endsAt: `${day}T14:00`, capacity: "100" };
}

export { eventPhase, type EventPhase } from "@/server/hq/launch-rules";

/** RSVPs and check-ins per event. */
export async function rsvpCounts(eventIds: string[]) {
  if (!eventIds.length) return new Map<string, { rsvps: number; checkedIn: number }>();
  const [all, inside] = await Promise.all([
    db.rsvp.groupBy({ by: ["eventId"], where: { eventId: { in: eventIds } }, _count: true }),
    db.rsvp.groupBy({ by: ["eventId"], where: { eventId: { in: eventIds }, checkedInAt: { not: null } }, _count: true }),
  ]);
  return new Map(eventIds.map((id) => [id, { rsvps: all.find((r) => r.eventId === id)?._count ?? 0, checkedIn: inside.find((r) => r.eventId === id)?._count ?? 0 }]));
}

export type RsvpFilter = "all" | "in" | "waiting";

/** One page of an event's RSVPs (name order), filtered by check-in and a name / member-number search. */
export async function rsvpPage(eventId: string, filter: RsvpFilter, q: string, page: number, pageSize: number) {
  const words = q.split(/\s+/).filter(Boolean);
  const where: Prisma.RsvpWhereInput = {
    eventId,
    ...(filter === "in" ? { checkedInAt: { not: null } } : filter === "waiting" ? { checkedInAt: null } : {}),
    ...(words.length && {
      customer: {
        AND: words.map((w) => ({
          OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }, { memberNo: { contains: w, mode: "insensitive" as const } }],
        })),
      },
    }),
  };
  const [total, rows] = await Promise.all([
    db.rsvp.count({ where }),
    db.rsvp.findMany({
      where,
      orderBy: [{ customer: { firstName: "asc" } }, { customer: { lastName: "asc" } }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, createdAt: true, checkedInAt: true, customer: { select: { id: true, firstName: true, lastName: true, memberNo: true, tier: true } } },
    }),
  ]);
  return { total, rows };
}

/** The door list: name and member number only (POPIA minimality), sorted by surname. */
export async function doorListCsv(e: StoreEvent & { store: { code: string } }) {
  const rows = await db.rsvp.findMany({
    where: { eventId: e.id },
    select: { customer: { select: { firstName: true, lastName: true, memberNo: true } } },
    orderBy: [{ customer: { lastName: "asc" } }, { customer: { firstName: "asc" } }],
  });
  const csv = toCsv({
    columns: [
      { key: "name", label: "Name" },
      { key: "memberNo", label: "Member number" },
    ],
    rows: rows.map((r) => ({ name: [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" "), memberNo: r.customer.memberNo })),
  });
  const filename = csvFilename("herbal-holland", "door-list", e.store.code, e.slug, dayKey(e.startsAt));
  return {
    rows: rows.length,
    response: new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" },
    }),
  };
}
