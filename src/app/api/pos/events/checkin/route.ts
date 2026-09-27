// Event door check-in: the member's ticket QR (HHRSVP:{code}) is scanned or typed at the till,
// checked against this store and the event's time (domain: events.checkIn) and the member is
// returned to attach to the basket. Wrong-store and wrong-day tickets get a plain explanation.
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { checkIn, EventError } from "@/server/events";
import { actorOf, json, PosError, readBody, withStaff } from "@/server/pos/http";
import { customerDetail } from "@/server/pos/customers";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { CheckInDTO } from "@/server/pos/types";

const Body = z.object({ code: z.string().trim().min(4, "Scan the ticket QR code").max(40) });

/** "HHRSVP:k7q2m9xa" / "K7Q2M9XA" → "K7Q2M9XA" (scanners and keyboards vary in case). */
const ticketCode = (raw: string) => raw.replace(/^HHRSVP:\s*/i, "").trim().toUpperCase();

export const POST = withStaff(async (req, pos) => {
  const code = ticketCode((await readBody(req, Body)).code);
  const storeId = pos.device.storeId;
  let r: Awaited<ReturnType<typeof checkIn>>;
  try {
    r = await checkIn(code, storeId);
  } catch (e) {
    if (e instanceof EventError) throw new PosError(await explain(code, storeId, e.message), 422);
    throw e;
  }
  if (r.first)
    await audit(db, actorOf(pos), "event.check_in", { storeId, entity: "StoreEvent", entityId: r.event.id, data: { customerId: r.customer.id } });
  const dto: CheckInDTO = {
    customer: await customerDetail(r.customer.id, storeId),
    event: { id: r.event.id, title: r.event.title, startsAt: r.event.startsAt.toISOString(), endsAt: r.event.endsAt.toISOString() },
    first: r.first,
  };
  return json(dto);
});

/** Why a ticket can't be checked in here and now, in words the door can pass on. */
async function explain(code: string, storeId: string, fallback: string) {
  const t = await db.rsvp.findUnique({
    where: { code },
    select: { event: { select: { storeId: true, title: true, startsAt: true, endsAt: true, store: { select: { name: true } } } } },
  });
  if (!t) return "We can't find that ticket — check the code, or find the member by phone instead";
  const e = t.event;
  if (e.storeId !== storeId) return `That ticket is for ${e.title} at Herbal Holland ${e.store.name}, not this store`;
  const now = new Date();
  if (e.endsAt < now) return `That ticket was for ${e.title} on ${fmtDate(e.startsAt)} — the event is over`;
  if (e.startsAt.getTime() - 2 * 3_600_000 > now.getTime()) return `That ticket is for ${e.title} on ${fmtDateTime(e.startsAt)} — check-in opens 2 hours before it starts`;
  return fallback;
}
