"use server";
// A member replying on one of their own support requests (with an optional photo).
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/server/auth";
import { memberReply, SupportError } from "@/server/support";

export type ReplyState = { ok?: boolean; error?: string; field?: string; values?: { body: string } };

export async function replyAction(ticketId: string, _: ReplyState, fd: FormData): Promise<ReplyState> {
  const customer = await getCustomer();
  if (!customer) return { error: "Please sign in again" };
  const body = String(fd.get("body") ?? "");
  const photo = fd.get("photo");
  try {
    await memberReply(ticketId, customer, body, photo instanceof File && photo.size > 0 ? photo : null);
  } catch (e) {
    if (e instanceof SupportError) return { error: e.message, field: e.field, values: { body } };
    throw e;
  }
  revalidatePath(`/club/support/${ticketId}`);
  revalidatePath("/club/support");
  return { ok: true };
}
