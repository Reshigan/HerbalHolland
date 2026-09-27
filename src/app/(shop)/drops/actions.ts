"use server";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { watchDrop } from "@/server/drops";

export type WatchState = { ok?: boolean; error?: string };

/** "Notify me": the scheduler tells watchers when the drop opens for them (app push, else SMS, in legal hours). */
export async function watchDropAction(dropId: string): Promise<WatchState> {
  const customer = await getCustomer();
  if (!customer) return { error: "Sign in so we know who to tell" };
  const drop = await db.drop.findUnique({ where: { id: dropId }, select: { id: true, endsAt: true } });
  if (!drop || (drop.endsAt && drop.endsAt <= new Date())) return { error: "This drop has ended" };
  await watchDrop(drop.id, customer.id);
  return { ok: true };
}
