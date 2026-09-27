"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { advanceOrder, nextStatuses, OrderError } from "@/server/orders";
import { getSettings, saveSetting } from "@/server/settings";
import { guard, inScope, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { str, parseRand, parseInt10 } from "@/server/hq/form";

/** Customer-service cancel from HQ (area managers may cancel orders in their region). */
export async function cancelOrder(orderId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("view");
  if (!g) return DENIED;
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, code: true, storeId: true, status: true, fulfilment: true } });
  if (!order || !(await inScope(g.scope, order.storeId))) return DENIED;
  const reason = str(fd, "reason");
  if (reason.length < 3) return fail("Say why — the customer is told their order was cancelled.", { reason: "Required" });
  if (!nextStatuses(order).includes("CANCELLED")) return fail("This order can no longer be cancelled.");
  try {
    await advanceOrder(order.id, "CANCELLED", g.actor, { note: `Cancelled by HQ: ${reason}` });
  } catch (e) {
    if (e instanceof OrderError) return fail(e.message);
    throw e;
  }
  revalidatePath(`/hq/orders/${order.code}`);
  revalidatePath("/hq/orders");
  flashTo(`/hq/orders/${order.code}`, "Order cancelled. Stock is released, any points used are returned and the customer has been told.");
}

export async function saveEcommerceSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const money = (k: string, max: number) => {
    const v = parseRand(str(fd, k));
    if (v == null || v < 0 || v > max) fields[k] = `R0 – R${max / 100}`;
    return v ?? 0;
  };
  const whole = (k: string, min: number, max: number, msg: string) => {
    const v = parseInt10(str(fd, k));
    if (v == null || v < min || v > max) fields[k] = msg;
    return v ?? min;
  };
  const next = {
    sameDayFeeCents: money("sameDayFee", 100_000),
    courierFeeCents: money("courierFee", 100_000),
    freeDeliveryOverCents: money("freeDeliveryOver", 1_000_000),
    sameDayCutoffHour: whole("sameDayCutoffHour", 8, 20, "Between 08 and 20"),
    unpaidHoldMinutes: whole("unpaidHoldMinutes", 15, 1440, "15 minutes to 24 hours"),
    collectHoldDays: whole("collectHoldDays", 1, 30, "1 to 30 days"),
  };
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const before = (await getSettings()).ecommerce;
  await saveSetting("ecommerce", next);
  await audit(db, g.actor, "settings.ecommerce", { entity: "Setting", entityId: "ecommerce", data: { before, after: next } });
  revalidatePath("/hq/orders");
  return done("Delivery and collection settings saved — checkout uses them immediately.");
}
