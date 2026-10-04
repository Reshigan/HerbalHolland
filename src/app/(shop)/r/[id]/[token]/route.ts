// The one-tap link in a reorder reminder: puts the item in the bag (stock and today's rules permitting) and opens
// the bag, which says what happened. The token is a signature of the reminder id, so ids can't be guessed into.
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { safeEqual } from "@/server/crypto";
import { reminderToken } from "@/server/shop/reminders";
import { reorderVariant } from "@/server/shop/reorder";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await params;
  if (!safeEqual(token, reminderToken(id))) redirect("/cart");
  const r = await db.reorderReminder.findUnique({ where: { id }, select: { variantId: true } });
  if (!r) redirect("/cart");
  const result = await reorderVariant(r.variantId, 1);
  redirect(`/cart?reorder=${encodeURIComponent(result.summary)}`);
}
