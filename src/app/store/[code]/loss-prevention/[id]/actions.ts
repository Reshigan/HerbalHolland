"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { visibleAlerts } from "@/server/loss";
import { actorOf, attempt, fail, type ActionState } from "@/server/store/context";
import { str } from "@/server/store/rules";
import { ALERT_STATUS } from "@/components/loss/labels";
import { ALERT_ROLES, NEXT_STATUS, canActOnAlerts } from "../access";
import type { AlertStatus } from "@/generated/prisma/client";

const DONE: Record<AlertStatus, string> = {
  INVESTIGATING: "Marked as investigating.",
  RESOLVED: "Resolved — the alert is closed and your note stays with it.",
  DISMISSED: "Dismissed as a false alarm — your note stays with it.",
  OPEN: "Reopened — it's back in the open queue.",
};

/** Moves an alert on (investigating, resolved, dismissed, reopened). Re-checks the store scope, the role and the
 *  alert's visibility — nobody can act on an alert about themselves, even with a hand-made request. */
export async function updateAlert(code: string, id: string, to: AlertStatus, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const user = await requireStaff(ALERT_ROLES);
    const store = await storeForUser(user, code);
    if (!canActOnAlerts(user)) return fail("Managers, owners, area managers and HQ work loss-prevention alerts.");
    const alert = await db.alert.findFirst({ where: { AND: [{ id }, visibleAlerts(user, [store.id])] }, select: { id: true, status: true } });
    if (!alert) return fail("That alert isn't available.");
    if (!NEXT_STATUS[alert.status].includes(to)) return fail(`It's ${ALERT_STATUS[alert.status].label.toLowerCase()} now — refresh to see where it stands.`);
    const note = str(fd, "note").slice(0, 1000);
    const closing = to === "RESOLVED" || to === "DISMISSED";
    if (closing && note.length < 3) return fail(to === "RESOLVED" ? "Say how it was resolved" : "Say why it's a false alarm", "note");

    // Only from the status the person saw: if someone else moved it meanwhile, nothing changes.
    const { count } = await db.alert.updateMany({
      where: { id: alert.id, status: alert.status },
      data: { status: to, note: note || null, closedById: closing ? user.id : null, closedAt: closing ? new Date() : null },
    });
    if (!count) return fail("Someone else updated this alert a moment ago — refresh to see where it stands.");
    await audit(db, actorOf(user), "alert.update", { storeId: store.id, entity: "Alert", entityId: alert.id, data: { from: alert.status, to, note: note || null } });

    revalidatePath(`/store/${store.code}/loss-prevention`);
    revalidatePath(`/store/${store.code}/commission`); // commission held for open alerts can be released once they close
    revalidatePath("/hq/loss-prevention");
    redirect(`/store/${store.code}/loss-prevention/${alert.id}?m=${encodeURIComponent(DONE[to])}`);
  });
}
