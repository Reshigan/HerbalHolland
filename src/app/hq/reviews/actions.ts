"use server";
// Review moderation: HQ admin and the HQ team hide a review (with a reason) or show it again. Hidden reviews never show
// on the product page nor count in its rating; the page is revalidated so the change is live at once.
import { revalidatePath } from "next/cache";
import { guard, DENIED, done, fail, type ActionState } from "@/server/hq/guard";
import { str } from "@/server/hq/form";
import { moderateReview, ReviewError } from "@/server/reviews";

async function run(id: string, hidden: boolean, reason: string): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  try {
    const r = await moderateReview(id, hidden, reason, { ...g.actor, id: g.user.id });
    revalidatePath("/hq/reviews");
    revalidatePath(`/p/${r.slug}`);
    if (!r.changed) return done("No change.");
    return done(hidden ? "Hidden. It no longer shows on the product page or counts in the rating." : "Showing again on the product page.");
  } catch (e) {
    if (e instanceof ReviewError) return fail(e.message, e.field ? { [e.field]: e.message } : undefined);
    throw e;
  }
}

export const hideReview = async (id: string, _: ActionState, fd: FormData) => run(id, true, str(fd, "reason"));
export const showReview = async (id: string, _: ActionState) => run(id, false, "");
