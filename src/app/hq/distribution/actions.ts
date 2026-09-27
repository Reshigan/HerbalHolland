"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { actOnStockOrder, PurchaseError } from "@/server/stock-orders";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str } from "@/server/hq/form";

type DcAction = "approve" | "reject" | "ship" | "cancel";

export async function actOnDcOrder(orderId: string, action: DcAction, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const order = await db.stockOrder.findUnique({ where: { id: orderId }, include: { seller: { select: { kind: true } }, buyer: { select: { name: true } } } });
  if (!order || order.kind !== "WHOLESALE" || order.seller.kind !== "WAREHOUSE") return fail("That isn't a distribution-centre order.");
  const reason = str(fd, "reason");
  if ((action === "reject" || action === "cancel") && reason.length < 3) return fail("Give the store a reason.", { reason: "Required" });
  try {
    if (reason) await db.stockOrder.update({ where: { id: orderId }, data: { notes: [order.notes, `${action === "reject" ? "Rejected" : "Cancelled"} by HQ (${g.user.name}): ${reason}`].filter(Boolean).join("\n") } });
    await actOnStockOrder(orderId, action, g.actor);
  } catch (e) {
    if (e instanceof PurchaseError) return fail(e.message);
    throw e;
  }
  revalidatePath("/hq/distribution");
  revalidatePath(`/hq/distribution/${orderId}`);
  if (action === "ship") {
    const lines = await db.stockOrderLine.findMany({ where: { stockOrderId: orderId }, select: { qty: true, shipped: true } });
    const shipped = lines.reduce((s, l) => s + ((l.shipped as { qty: number }[] | null) ?? []).reduce((a, b) => a + b.qty, 0), 0);
    const ordered = lines.reduce((s, l) => s + l.qty, 0);
    return done(shipped < ordered ? `Shipped ${shipped} of ${ordered} units to ${order.buyer.name} — ${ordered - shipped} short (not enough released stock).` : `Shipped ${shipped} units to ${order.buyer.name}. The store books it in on arrival and is invoiced for what it receives.`);
  }
  return done({ approve: `Approved — ready to pick for ${order.buyer.name}.`, reject: "Order rejected; the store can see why.", cancel: "Order cancelled." }[action]);
}
