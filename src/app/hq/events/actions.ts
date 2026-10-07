"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { can, guard, inScope, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { readEvent, type EventData } from "@/server/hq/events";
import { str } from "@/server/hq/form";
import { fmtDateTime } from "@/lib/format";

/** HQ team: any store. Area managers: stores in their region. */
async function editor(storeId: string) {
  const g = await guard("view");
  if (!g) return null;
  const ok = can(g.user, "network") || (g.user.role === "AREA_MANAGER" && (await inScope(g.scope, storeId)));
  return ok ? g : null;
}

export async function saveEvent(eventId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const before = eventId ? await db.storeEvent.findUnique({ where: { id: eventId } }) : null;
  if (eventId && !before) return fail("That event no longer exists.");
  // The store is fixed once an event exists: tickets are checked in at that store's tills.
  const storeId = before?.storeId ?? str(fd, "storeId");
  if (!storeId) return fail("Check the highlighted fields.", { storeId: "Choose the store hosting the event" });
  const g = await editor(storeId);
  if (!g) return DENIED;
  const store = await db.store.findFirst({ where: { id: storeId, kind: "RETAIL", status: { not: "CLOSED" } }, select: { id: true, name: true } });
  if (!store) return fail("Check the highlighted fields.", { storeId: "Choose an open store" });
  const r = await readEvent(fd, before);
  if ("fields" in r) return fail(r.fields.blurb?.startsWith("“") ? "The copy needs changes before the event can be saved." : "Check the highlighted fields.", r.fields);

  if (!before) {
    const e = await db.storeEvent.create({ data: { ...r.data, storeId } });
    await audit(db, g.actor, "event.create", { storeId, entity: "StoreEvent", entityId: e.id, data: { title: e.title, startsAt: e.startsAt.toISOString(), capacity: e.capacity } });
    revalidatePath("/hq/events");
    flashTo(`/hq/events/${e.id}`, `“${e.title}” at ${store.name} is on for ${fmtDateTime(e.startsAt)}. Members can RSVP from its page.`);
  }
  const changed = (Object.keys(r.data) as (keyof EventData)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(r.data[k]));
  if (!changed.length) return done("No changes to save.");
  await db.storeEvent.update({ where: { id: before.id }, data: r.data });
  await audit(db, g.actor, "event.update", { storeId, entity: "StoreEvent", entityId: before.id, data: { changed } });
  revalidatePath("/hq/events");
  revalidatePath(`/hq/events/${before.id}`);
  return done("Event saved.");
}

export async function deleteEvent(eventId: string, _: ActionState): Promise<ActionState> {
  const e = await db.storeEvent.findUnique({ where: { id: eventId }, include: { _count: { select: { rsvps: true } } } });
  if (!e) return fail("That event no longer exists.");
  const g = await editor(e.storeId);
  if (!g) return DENIED;
  if (e._count.rsvps) return fail("Members hold tickets for this event. Change the details instead of deleting it.");
  await db.storeEvent.delete({ where: { id: e.id } });
  await audit(db, g.actor, "event.delete", { storeId: e.storeId, entity: "StoreEvent", entityId: e.id, data: { title: e.title, startsAt: e.startsAt.toISOString() } });
  revalidatePath("/hq/events");
  flashTo("/hq/events", `“${e.title}” deleted.`);
}
