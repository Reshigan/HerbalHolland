"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { advanceOrder, nextStatuses } from "@/server/orders";
import { merchShipped } from "@/server/merch";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { bool, str } from "@/server/store/rules";
import { zar } from "@/lib/money";
import type { OrderStatus } from "@/generated/prisma/client";
import type { TenderInput } from "@/server/sales";

const METHODS = ["CARD", "CASH", "PAYSHAP", "EFT"] as const;

/** Moves an online order along (pick → ready → handover / dispatch → delivered, or cancel). */
export async function moveOrder(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const o = await db.order.findFirst({ where: { id, storeId: store.id } });
    if (!o) return fail("Order not found");
    const to = str(fd, "to") as OrderStatus;
    if (to === "PLACED") return fail("Online payments are confirmed by the payment gateway, not in the back office.");
    if (!nextStatuses(o).includes(to)) return fail(`This order can't move to ${to.toLowerCase().replaceAll("_", " ")} from ${o.status.toLowerCase().replaceAll("_", " ")}`);

    const handover = to === "COMPLETED" && o.fulfilment === "COLLECT";
    const due = o.totalCents - o.pointsRedeemed * 100;
    let payments: TenderInput[] | undefined;
    let shiftId: string | null = null;
    if (handover && o.paymentStatus !== "PAID" && due > 0) {
      const method = str(fd, "method") as (typeof METHODS)[number];
      if (!METHODS.includes(method)) return fail("Choose how the member paid", "method");
      if (method === "CASH") {
        const shift = await db.shift.findFirst({ where: { storeId: store.id, closedAt: null }, orderBy: { openedAt: "desc" } });
        if (!shift) return fail("Cash must go through an open till shift — take card, PayShap or EFT here, or hand over at the POS.", "method");
        shiftId = shift.id;
      }
      payments = [{ method, amountCents: due, reference: str(fd, "reference").slice(0, 60) || undefined, provider: method === "CARD" ? "EXTERNAL" : undefined }];
    }
    const note = str(fd, "note").slice(0, 300) || undefined;
    await advanceOrder(id, to, actor, {
      idChecked: bool(fd, "idChecked"),
      payments,
      staffId: user.id,
      staffCanDispense: user.canDispense,
      shiftId,
      courier: str(fd, "courier").slice(0, 80) || undefined,
      trackingNo: str(fd, "trackingNo").slice(0, 80) || undefined,
      note: to === "CANCELLED" ? `Cancelled by ${user.name}${note ? `: ${note}` : ""}` : note,
    });
    revalidatePath(`/store/${store.code}/orders`);
    revalidatePath(`/store/${store.code}/orders/${id}`);
    const msg: Partial<Record<OrderStatus, string>> = {
      PICKING: `Picking ${o.code}.`,
      READY: o.fulfilment === "COLLECT" ? `${o.code} is ready — the member has been sent their collection message.` : `${o.code} is packed and ready to dispatch.`,
      OUT_FOR_DELIVERY: `${o.code} dispatched — the member has been notified.`,
      COMPLETED: handover ? `${o.code} handed over${payments ? ` · ${zar(due)} taken by ${payments[0].method.toLowerCase()}` : ""}. The sale is posted and the invoice emailed.` : `${o.code} delivered.`,
      CANCELLED: `${o.code} cancelled — stock released and the member notified.`,
    };
    return done(msg[to] ?? "Order updated.");
  });
}

/** The merch partner's shipping email: record the courier and tracking number for the merch on this order. */
export async function shipMerch(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const courier = str(fd, "courier").slice(0, 60);
    const trackingNo = str(fd, "trackingNo").slice(0, 60);
    if (!courier) return fail("Which courier is it with?", "courier");
    if (!trackingNo) return fail("Add the tracking number from the partner's email", "trackingNo");
    await merchShipped(id, store.id, { courier, trackingNo }, actor);
    revalidatePath(`/store/${store.code}/orders`);
    revalidatePath(`/store/${store.code}/orders/${id}`);
    return done("Merch marked as shipped — the member has been sent their tracking number.");
  });
}
