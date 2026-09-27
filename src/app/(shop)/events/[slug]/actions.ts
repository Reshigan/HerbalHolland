"use server";
import { refresh } from "next/cache";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { audit } from "@/server/audit";
import { cancelRsvp, EventError, rsvp } from "@/server/events";

export type RsvpState = { ok?: boolean; error?: string };

/** Reserves a place (capacity-locked and idempotent in the events service). */
export async function rsvpAction(eventId: string, _: RsvpState, _form: FormData): Promise<RsvpState> {
  const customer = await getCustomer();
  if (!customer) return { error: "Sign in to reserve your place" };
  const event = await db.storeEvent.findUnique({ where: { id: eventId }, select: { id: true, storeId: true } });
  if (!event) return { error: "That event doesn't exist" };
  try {
    const r = await rsvp(event.id, customer.id);
    await audit(db, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "event.rsvp", { storeId: event.storeId, entity: "Rsvp", entityId: r.id });
  } catch (e) {
    if (e instanceof EventError) return { error: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

/** Gives the place back (tickets already used at the door stay). */
export async function cancelRsvpAction(eventId: string): Promise<RsvpState> {
  const customer = await getCustomer();
  if (!customer) return { error: "Please sign in again" };
  const event = await db.storeEvent.findUnique({ where: { id: eventId }, select: { id: true, storeId: true } });
  if (!event) return { error: "That event doesn't exist" };
  const { count } = await cancelRsvp(event.id, customer.id);
  if (!count) return { error: "There's no place to cancel — tickets already used at the door can't be cancelled" };
  await audit(db, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "event.rsvp_cancel", { storeId: event.storeId, entity: "StoreEvent", entityId: event.id });
  refresh();
  return { ok: true };
}
