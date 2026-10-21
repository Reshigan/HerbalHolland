// In-store events (opening weekends, members' evenings): RSVP tickets and door check-in at the till.
import { db, tx } from "./db";
import { shortCode } from "./counters";

export class EventError extends Error {}

/** Reserves a place (idempotent per member). Capacity is checked against the RSVPs as they stand (D1 serialises writes). */
export async function rsvp(eventId: string, customerId: string, now = new Date()) {
  return tx(async (t) => {
    const [e] = await t.$queryRaw<{ capacity: number; endsAt: Date | string }[]>`SELECT capacity, "endsAt" FROM "StoreEvent" WHERE id = ${eventId}`;
    if (!e) throw new EventError("That event doesn't exist");
    const mine = await t.rsvp.findUnique({ where: { eventId_customerId: { eventId, customerId } } });
    if (mine) return mine;
    if (new Date(e.endsAt) < now) throw new EventError("This event has ended");
    if ((await t.rsvp.count({ where: { eventId } })) >= e.capacity) throw new EventError("This event is full, but come and see us in store");
    return t.rsvp.create({ data: { eventId, customerId, code: shortCode(8) } });
  });
}

export const cancelRsvp = (eventId: string, customerId: string) => db.rsvp.deleteMany({ where: { eventId, customerId, checkedInAt: null } });

/** Door check-in from the ticket QR (HHRSVP:{code}) at the event's store, on the day. Returns the member to attach. */
export async function checkIn(code: string, storeId: string, now = new Date()) {
  const r = await db.rsvp.findUnique({ where: { code: code.replace(/^HHRSVP:/, "").trim().toUpperCase() }, include: { event: true, customer: true } });
  if (!r || r.event.storeId !== storeId) throw new EventError("That ticket isn't for an event at this store");
  const early = new Date(r.event.startsAt.getTime() - 2 * 3_600_000);
  if (now < early || now > r.event.endsAt) throw new EventError(`That ticket is for ${r.event.title}`);
  const first = !r.checkedInAt;
  if (first) await db.rsvp.update({ where: { id: r.id }, data: { checkedInAt: now } });
  return { customer: r.customer, event: r.event, first };
}
