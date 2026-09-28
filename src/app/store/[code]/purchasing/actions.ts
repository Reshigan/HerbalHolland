"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { availability, availKey } from "@/server/inventory";
import { actOnStockOrder, createStockOrder } from "@/server/stock-orders";
import { attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { parseWhole, plural, receiptCheck, str } from "@/server/store/rules";
import type { StockOrder } from "@/generated/prisma/client";

type Shipped = { batchId: string; qty: number }[];

/** New wholesale order to the store's distribution centre, from the replenishment builder (intent=draft saves it unsubmitted). */
export async function placeWholesaleOrder(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await attempt(async () => {
    const { store, actor } = await manage(code);
    if (!store.dcId) return fail("Your store isn't linked to a distribution centre yet — ask HQ to set one up.");
    const lines: { variantId: string; qty: number }[] = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("qty:")) continue;
      const qty = parseWhole(String(v), 0, 10_000);
      if (qty == null) return fail("Quantities must be whole numbers up to 10,000");
      if (qty > 0) lines.push({ variantId: k.slice(4), qty });
    }
    if (!lines.length) return fail("Add at least one item to the order");
    const ranged = await db.storeVariant.findMany({
      where: { storeId: store.id, variantId: { in: lines.map((l) => l.variantId) }, variant: { active: true, product: { status: "ACTIVE" } } },
      select: { variantId: true },
    });
    const ok = new Set(ranged.map((r) => r.variantId));
    const bad = lines.filter((l) => !ok.has(l.variantId));
    if (bad.length) return fail(`${bad.length} item${bad.length > 1 ? "s are" : " is"} no longer ranged or available — refresh and try again`);
    const draft = str(fd, "intent") === "draft";
    const order = await createStockOrder({ buyerId: store.id, sellerId: store.dcId, kind: "WHOLESALE", lines, notes: str(fd, "notes").slice(0, 500) || undefined, actor, submit: !draft });
    id = order.id;
    return done(draft ? `Draft ${order.number} saved` : `Order ${order.number} submitted`);
  });
  if (id) {
    revalidatePath(`/store/${code}/purchasing`);
    redirect(`/store/${code}/purchasing/${id}`);
  }
  return res;
}

async function buyerOrder(storeId: string, id: string) {
  const o = await db.stockOrder.findFirst({ where: { id, buyerId: storeId }, include: { lines: true } });
  if (!o) throw new UserError("Order not found");
  return o;
}

/** Puts units from a cancelled or rejected network order back on the seller's listing. */
async function restoreListing(o: StockOrder & { lines: { variantId: string; qty: number }[] }) {
  if (o.kind !== "NETWORK") return;
  for (const l of o.lines) {
    const listing = await db.listing.findFirst({ where: { storeId: o.sellerId, variantId: l.variantId, createdAt: { lte: o.createdAt } }, orderBy: { createdAt: "desc" } });
    if (listing) await db.listing.update({ where: { id: listing.id }, data: { qty: { increment: l.qty }, active: true } });
  }
}

export async function receiveOrder(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const o = await buyerOrder(store.id, id);
    if (o.status !== "SHIPPED") return fail(`This order is ${o.status.toLowerCase()} — only shipped orders can be received`);
    const received: Record<string, number> = {};
    const check: { ordered: number; shipped: number; received: number }[] = [];
    for (const line of o.lines) {
      const shipped = ((line.shipped as Shipped | null) ?? []).reduce((s, b) => s + b.qty, 0);
      const qty = parseWhole(str(fd, `recv:${line.id}`), 0, shipped);
      if (qty == null) return fail(`Received quantities must be between 0 and what was shipped (${shipped})`, `recv:${line.id}`);
      received[line.id] = qty;
      check.push({ ordered: line.qty, shipped, received: qty });
    }
    await actOnStockOrder(id, "receive", actor, { received });
    const summary = receiptCheck(check);
    const note = str(fd, "note").slice(0, 500);
    if (note) await db.stockOrder.update({ where: { id }, data: { notes: [o.notes, `Receiving: ${note}`].filter(Boolean).join("\n") } });
    if (!summary.clean)
      await audit(db, actor, "stockorder.discrepancy", { storeId: store.id, entity: "StockOrder", entityId: id, data: { number: o.number, shortShipped: summary.shortShipped, shortReceived: summary.shortReceived, note: note || undefined } });
    revalidatePath(`/store/${store.code}/purchasing`);
    revalidatePath(`/store/${store.code}/inventory`);
    return done(
      `Received ${plural(summary.units, "unit")} into stock.${summary.shortReceived ? ` ${summary.shortReceived} short against the delivery note — flagged for the supplier.` : ""} The tax invoice is on its way to ${store.company.email ?? "the owner"}.`,
    );
  });
}

export async function cancelOrder(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const o = await buyerOrder(store.id, id);
    await actOnStockOrder(id, "cancel", actor);
    await restoreListing(o);
    revalidatePath(`/store/${store.code}/purchasing/${id}`);
    return done(`${o.number} cancelled.`);
  });
}

export async function submitDraft(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const o = await buyerOrder(store.id, id);
    await actOnStockOrder(id, "submit", actor);
    revalidatePath(`/store/${store.code}/purchasing/${id}`);
    return done(`${o.number} submitted to ${o.kind === "WHOLESALE" ? "the distribution centre" : "the selling store"}.`);
  });
}

/** Seller side of a network order: accept, decline or ship stock to the buying store. */
export async function sellerAct(code: string, id: string, action: "approve" | "reject" | "ship", _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    if (!["approve", "reject", "ship"].includes(action)) return fail("Unknown action");
    const o = await db.stockOrder.findFirst({ where: { id, sellerId: store.id, kind: "NETWORK" }, include: { lines: true, buyer: { select: { name: true } } } });
    if (!o) return fail("Order not found");
    if (action === "ship") {
      const avail = await availability([store.id], o.lines.map((l) => l.variantId));
      const shippable = o.lines.reduce((s, l) => s + Math.min(l.qty, Math.max(0, avail.get(availKey(store.id, l.variantId))?.available ?? 0)), 0);
      if (!shippable) return fail("You have none of these items available to ship — reject the order instead.");
    }
    await actOnStockOrder(id, action, actor);
    if (action === "reject") await restoreListing(o);
    revalidatePath(`/store/${store.code}/network`);
    revalidatePath(`/store/${store.code}/purchasing/${id}`);
    const verb = { approve: "accepted", reject: "declined", ship: "shipped" }[action];
    return done(`${o.number} ${verb}${action === "ship" ? ` to ${o.buyer.name}` : ""}.`);
  });
}
