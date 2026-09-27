"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { readEvent, type EventData } from "@/server/hq/events";
import { fmtDateTime } from "@/lib/format";

/** Managers and owners create and edit their own store's events; the store always comes from the URL's scope check. */
export async function saveStoreEvent(code: string, eventId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const before = eventId ? await db.storeEvent.findFirst({ where: { id: eventId, storeId: store.id } }) : null;
    if (eventId && !before) return fail("That event isn't one of your store's");
    const read = await readEvent(fd, before);
    if ("fields" in read) return { error: read.fields.blurb?.startsWith("“") ? "The copy needs changes before the event can be saved." : "Check the highlighted fields.", fields: read.fields, at: Date.now() };
    if (!before) {
      const e = await db.storeEvent.create({ data: { ...read.data, storeId: store.id } });
      await audit(db, actor, "event.create", { storeId: store.id, entity: "StoreEvent", entityId: e.id, data: { title: e.title, startsAt: e.startsAt.toISOString(), capacity: e.capacity } });
      revalidatePath(`/store/${store.code}/events`);
      redirect(`/store/${store.code}/events/${e.id}?m=${encodeURIComponent(`“${e.title}” is on for ${fmtDateTime(e.startsAt)} — members can RSVP from its page.`)}`);
    }
    const changed = (Object.keys(read.data) as (keyof EventData)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(read.data[k]));
    if (!changed.length) return done("No changes to save.");
    await db.storeEvent.update({ where: { id: before.id }, data: read.data });
    await audit(db, actor, "event.update", { storeId: store.id, entity: "StoreEvent", entityId: before.id, data: { changed } });
    revalidatePath(`/store/${store.code}/events`);
    revalidatePath(`/store/${store.code}/events/${before.id}`);
    return done("Event saved.");
  });
}

export async function deleteStoreEvent(code: string, eventId: string, _: ActionState): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const e = await db.storeEvent.findFirst({ where: { id: eventId, storeId: store.id }, include: { _count: { select: { rsvps: true } } } });
    if (!e) return fail("Event not found");
    if (e._count.rsvps) return fail("Members hold tickets for this event — change the details instead of deleting it.");
    await db.storeEvent.delete({ where: { id: e.id } });
    await audit(db, actor, "event.delete", { storeId: store.id, entity: "StoreEvent", entityId: e.id, data: { title: e.title, startsAt: e.startsAt.toISOString() } });
    revalidatePath(`/store/${store.code}/events`);
    redirect(`/store/${store.code}/events?m=${encodeURIComponent(`“${e.title}” deleted.`)}`);
  });
}
