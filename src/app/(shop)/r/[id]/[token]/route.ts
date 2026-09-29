// The one-tap link in a reorder reminder: puts the item in the bag (stock and today's rules permitting) and opens
// the bag, which says what happened. The token is a signature of the reminder id, so ids can't be guessed into.
import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { reminderToken } from "@/server/shop/reminders";
import { reorderVariant } from "@/server/shop/reorder";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await params;
  const want = reminderToken(id);
  if (token.length !== want.length || !timingSafeEqual(Buffer.from(token), Buffer.from(want))) redirect("/cart");
  const r = await db.reorderReminder.findUnique({ where: { id }, select: { variantId: true } });
  if (!r) redirect("/cart");
  const result = await reorderVariant(r.variantId, 1);
  redirect(`/cart?reorder=${encodeURIComponent(result.summary)}`);
}
