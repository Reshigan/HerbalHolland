// Gift vouchers. Bought at /gift: the purchase is an ordinary online order for the virtual "Gift voucher" product
// (a DRAFT product, so it is never listed, with one variant per amount and no stock), paid through the usual online
// payment flow; when that order is paid it completes on the spot — nothing to pick — and the voucher is issued and
// emailed. Redeemed at checkout (the balance pays what points left, before any online payment) or at the till, as a
// tender like any other (sales.postPosSale; refunds go back onto the voucher first). A voucher is money, not an
// incentive (no bonus value, allowed on everything); CPA s63(2) makes it valid for three years from issue.
import { cache } from "react";
import { db, tx, type Tx } from "@/server/db";
import { audit, SYSTEM, type Actor } from "@/server/audit";
import { pinCode, shortCode } from "@/server/counters";
import { deliverEmail } from "@/server/email";
import { APP_URL, callout, emailLayout, esc, facts, para, textDoc } from "@/server/email-templates";
import { notifyCustomer } from "@/server/messaging";
import { queuePosting } from "@/server/ledger/core";
import { sms } from "@/lib/sms";
import { fmtDate } from "@/lib/format";
import { zar, zarWhole } from "@/lib/money";
import {
  isVoucherSku, makeVoucherCode, maskVoucherCode, normaliseVoucherCode, voucherApply, voucherExpiry, voucherProblem, voucherSku, VOUCHER_AMOUNTS_CENTS, VOUCHER_MESSAGE_MAX, VOUCHER_PRODUCT_SLUG,
} from "@/lib/vouchers";
import type { GiftVoucher, OrderStatus } from "@/generated/prisma/client";
import { isEmail } from "@/lib/email";

export class VoucherError extends Error {}
export const VOUCHER_CATEGORY_SLUG = "gift-vouchers";
type Event = { status: OrderStatus; at: string; note?: string };

// ── The virtual product ───────────────────────────────────────────────────────

/** The "Gift voucher" product and its variants (one per amount), created on first use. DRAFT: never in the shop. */
export async function ensureVoucherProduct() {
  const existing = await db.product.findUnique({ where: { slug: VOUCHER_PRODUCT_SLUG }, include: { variants: { orderBy: { priceCents: "asc" } } } });
  if (existing && VOUCHER_AMOUNTS_CENTS.every((c) => existing.variants.some((v) => v.sku === voucherSku(c)))) return existing;
  return tx(async (t) => {
    const category =
      (await t.category.findUnique({ where: { slug: VOUCHER_CATEGORY_SLUG } })) ??
      (await t.category.create({ data: { slug: VOUCHER_CATEGORY_SLUG, name: "Gift vouchers", icon: "Gift", sortOrder: 99, blurb: "Herbal Holland gift vouchers, redeemable online or in store on anything in the range." } }));
    const product =
      existing ??
      (await t.product.create({
        data: {
          slug: VOUCHER_PRODUCT_SLUG, name: "Gift voucher", tagline: "Give the gift of choice", categoryId: category.id, regClass: "ACCESSORY", status: "DRAFT",
          description: "A Herbal Holland gift voucher: redeemable online or at the counter in any store, on anything in the range, for three years from the date of issue.",
          legalBasis: "Consumer Protection Act s63 — prepaid voucher, valid three years",
        },
        include: { variants: true },
      }));
    for (const [i, cents] of VOUCHER_AMOUNTS_CENTS.entries())
      if (!product.variants.some((v) => v.sku === voucherSku(cents)))
        await t.variant.create({ data: { productId: product.id, sku: voucherSku(cents), name: zarWhole(cents), priceCents: cents, wholesaleCents: cents, costCents: cents, sortOrder: i } });
    return t.product.findUniqueOrThrow({ where: { id: product.id }, include: { variants: { orderBy: { priceCents: "asc" } } } });
  });
}

export const isVoucherOrder = (lines: { variant: { sku: string } }[]) => lines.length > 0 && lines.every((l) => isVoucherSku(l.variant.sku));

/** Voucher orders sit with the franchisor (its warehouse, else any trading store): the voucher liability is HQ's. */
async function voucherStore() {
  const s =
    (await db.store.findFirst({ where: { status: "ACTIVE", company: { kind: "FRANCHISOR" } }, orderBy: [{ kind: "desc" }, { code: "asc" }], select: { id: true } })) ??
    (await db.store.findFirst({ where: { status: "ACTIVE" }, orderBy: [{ kind: "desc" }, { code: "asc" }], select: { id: true } }));
  if (!s) throw new VoucherError("Gift vouchers aren't on sale yet");
  return s;
}

async function uniqueCode(t: Tx) {
  for (let i = 0; i < 5; i++) {
    const code = makeVoucherCode();
    if (!(await t.giftVoucher.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new VoucherError("Please try again");
}

// ── Buying ────────────────────────────────────────────────────────────────────

export type VoucherPurchase = { customer: { id: string; firstName: string }; amountCents: number; recipientName?: string | null; recipientEmail?: string | null; message?: string | null };

/** Starts a purchase: an unpaid order for the voucher variant plus a pending voucher. The pay page takes it from here. */
export async function startVoucherPurchase(a: VoucherPurchase) {
  const amount = VOUCHER_AMOUNTS_CENTS.find((c) => c === a.amountCents);
  if (!amount) throw new VoucherError("Choose an amount");
  const recipientEmail = a.recipientEmail?.trim().toLowerCase() || null;
  if (recipientEmail && !isEmail(recipientEmail)) throw new VoucherError("That email address doesn't look right");
  const message = a.message?.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, VOUCHER_MESSAGE_MAX) || null;
  const recipientName = a.recipientName?.trim().slice(0, 60) || null;
  const product = await ensureVoucherProduct();
  const variant = product.variants.find((v) => v.priceCents === amount)!;
  const store = await voucherStore();
  const now = new Date();
  return tx(async (t) => {
    const order = await t.order.create({
      data: {
        code: shortCode(6), collectionCode: pinCode(), customerId: a.customer.id, storeId: store.id, status: "PENDING_PAYMENT", fulfilment: "COLLECT",
        routingNote: "Gift voucher: issued by email when paid", subtotalCents: amount, discountCents: 0, deliveryCents: 0, pointsRedeemed: 0, totalCents: amount,
        // VAT on a voucher is accounted for when it is redeemed (VAT Act s10(18)): none at issue.
        vatCents: 0, payMethod: "ONLINE", paymentStatus: "UNPAID",
        events: [{ status: "PENDING_PAYMENT", at: now.toISOString(), note: "Gift voucher" }] satisfies Event[],
        lines: { create: [{ variantId: variant.id, qty: 1, unitPriceCents: amount, memberSavingsCents: 0, offerCents: 0, totalCents: amount }] },
      },
    });
    const voucher = await t.giftVoucher.create({
      data: { code: await uniqueCode(t), amountCents: amount, balanceCents: amount, purchasedByCustomerId: a.customer.id, purchaseOrderId: order.id, recipientEmail, recipientName, message, status: "PENDING", expiresAt: voucherExpiry(now) },
    });
    await audit(t, { type: "CUSTOMER", id: a.customer.id, name: a.customer.firstName }, "voucher.purchase", { storeId: store.id, entity: "GiftVoucher", entityId: voucher.id, data: { amount, orderId: order.id, recipient: !!recipientEmail } });
    return { order, voucher };
  });
}

/** Called by markOrderPaid for a voucher order: completes it, issues the voucher (three years from today) and sends it. */
export async function completeVoucherOrder(o: { id: string; code: string; customerId: string; events: unknown }, reference: string) {
  const now = new Date();
  const events = [...((o.events as Event[]) ?? []), { status: "COMPLETED" as const, at: now.toISOString(), note: "Paid — gift voucher issued" }];
  const { count } = await db.order.updateMany({ where: { id: o.id, status: "PENDING_PAYMENT" }, data: { status: "COMPLETED", paymentStatus: "PAID", paymentRef: reference, completedAt: now, events } });
  if (!count) return;
  const v = await db.giftVoucher.findFirst({ where: { purchaseOrderId: o.id } });
  if (!v) return;
  const issued =
    v.status === "PENDING"
      ? await tx(async (t) => {
          await queuePosting(t, "voucher", v.id); // sold: HQ's books
          return t.giftVoucher.update({ where: { id: v.id }, data: { status: "ACTIVE", issuedAt: now, expiresAt: voucherExpiry(now) } });
        })
      : v;
  await audit(db, SYSTEM, "voucher.issue", { entity: "GiftVoucher", entityId: v.id, data: { code: maskVoucherCode(v.code), amount: v.amountCents, orderId: o.id, expiresAt: issued.expiresAt } });
  await sendVoucher(issued);
}

// ── The voucher message ───────────────────────────────────────────────────────

function voucherEmail(v: GiftVoucher, to: "buyer" | "recipient", buyer: { firstName: string; lastName: string | null }) {
  const base = APP_URL();
  const from = [buyer.firstName, buyer.lastName].filter(Boolean).join(" ");
  const code = `<div style="margin:6px 0 18px;padding:18px 20px;border-radius:16px;background:#0c0a09;text-align:center"><div style="font-family:'Outfit',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#f5913c">Voucher code</div><div style="margin-top:6px;font-family:'Outfit',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;letter-spacing:0.08em;color:#fbf7f3">${esc(v.code)}</div><div style="margin-top:4px;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:13px;color:#bdb3a9">${esc(zar(v.amountCents))} · valid until ${esc(fmtDate(v.expiresAt))}</div></div>`;
  const how = para(`Use it online: enter the code at checkout under <strong>Gift voucher</strong>. In store: show this email at the counter. Whatever isn't spent stays on the voucher until it's used up. It can't be exchanged for cash, and it isn't a promotion — it pays for anything in the range.`);
  const body =
    to === "recipient"
      ? `${para(`${esc(from || "A friend")} sent you a Herbal Holland gift voucher${v.recipientName ? `, ${esc(v.recipientName)}` : ""}.`)}${v.message ? callout(`“${esc(v.message)}”`, "soft") : ""}${code}${how}${para("Herbal Holland is for adults 18+: bring your ID when you collect or shop in store.", { muted: true, small: true })}`
      : `${para(`Thank you, ${esc(buyer.firstName)} — your ${esc(zar(v.amountCents))} gift voucher is ready.${v.recipientEmail ? ` We've also emailed it to ${esc(v.recipientEmail)}.` : ""}`)}${code}${facts([["Amount", esc(zar(v.amountCents))], ["Valid until", esc(fmtDate(v.expiresAt))]])}${how}`;
  const subject = to === "recipient" ? `${from || "Someone"} sent you a ${zarWhole(v.amountCents)} Herbal Holland gift voucher` : `Your ${zarWhole(v.amountCents)} Herbal Holland gift voucher`;
  const html = emailLayout({
    preheader: `${v.code} · ${zar(v.amountCents)} · valid until ${fmtDate(v.expiresAt)}`,
    eyebrow: "Gift voucher",
    heading: to === "recipient" ? "A gift for you" : "Your gift voucher is ready",
    body,
    cta: { label: "Shop the range", href: `${base}/shop` },
    footerHtml: to === "recipient" ? "You received this because someone bought you a Herbal Holland gift voucher. It's a one-off: we won't email you again unless you shop with us." : undefined,
  });
  const text = textDoc(
    to === "recipient" ? `${from || "A friend"} sent you a Herbal Holland gift voucher.` : `Your ${zar(v.amountCents)} Herbal Holland gift voucher is ready.`,
    v.message && to === "recipient" ? `"${v.message}"` : null,
    "",
    `Voucher code: ${v.code}`,
    `Amount: ${zar(v.amountCents)} · valid until ${fmtDate(v.expiresAt)}`,
    "",
    "Use it online: enter the code at checkout under Gift voucher. In store: show this email at the counter. Adults 18+.",
    `${base}/shop`,
  );
  return { subject, html, text };
}

async function logEmail(to: string, subject: string, ok: boolean, customerId: string | null) {
  await db.messageLog.create({ data: { channel: "EMAIL", to, kind: "TRANSACTIONAL", status: ok ? "SENT" : "FAILED", reason: ok ? null : "No email provider (SMTP_URL) configured", body: subject, customerId } });
}

/** Emails the voucher to the buyer (and the recipient, when there is one) and texts the buyer the code. */
export async function sendVoucher(v: GiftVoucher) {
  const buyer = v.purchasedByCustomerId ? await db.customer.findUnique({ where: { id: v.purchasedByCustomerId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } }) : null;
  const who = buyer ?? { id: null, firstName: "A friend", lastName: null, email: null, phone: null };
  if (buyer?.email) {
    const m = voucherEmail(v, "buyer", who);
    await logEmail(buyer.email, m.subject, await deliverEmail({ to: buyer.email, ...m, customerId: buyer.id, kind: "TRANSACTIONAL" }), buyer.id);
  }
  if (v.recipientEmail) {
    const m = voucherEmail(v, "recipient", who);
    await logEmail(v.recipientEmail, m.subject, await deliverEmail({ to: v.recipientEmail, ...m, kind: "TRANSACTIONAL" }), null);
  }
  if (buyer?.phone) {
    const text = (code: string) => sms(`Your ${zarWhole(v.amountCents)} gift voucher ${code} is ready, valid until ${fmtDate(v.expiresAt)}. Enter it at checkout or show it in store.`);
    await notifyCustomer({ id: buyer.id, phone: buyer.phone }, text(v.code), text(maskVoucherCode(v.code)));
  }
  await db.giftVoucher.update({ where: { id: v.id }, data: { sentAt: new Date() } });
}

// ── Redeeming ─────────────────────────────────────────────────────────────────

/** The voucher a member typed at checkout (or the till scanned), or why it can't pay right now. */
export async function voucherForCheckout(raw: string, now = new Date()): Promise<{ ok: true; voucher: GiftVoucher } | { ok: false; error: string }> {
  const code = normaliseVoucherCode(raw);
  if (!code) return { ok: false, error: "That doesn't look like a gift voucher code (HH-XXXX-XXXX-XXXX)." };
  const v = await db.giftVoucher.findUnique({ where: { code } });
  const problem = voucherProblem(v, now, fmtDate);
  return problem ? { ok: false, error: problem } : { ok: true, voucher: v! };
}

/**
 * Takes `cents` off the voucher for an order placed online (`orderId`), a till sale (`saleId`) or a counter voucher on a
 * pay-in-store order handed over at the till (both) — inside that transaction. Refuses if the balance moved meanwhile.
 */
export async function redeemVoucherTx(t: Tx, a: { voucher: GiftVoucher; cents: number; actor: Actor; orderId?: string | null; saleId?: string | null; storeId?: string | null }) {
  if (a.cents <= 0) return;
  if (!a.orderId && !a.saleId) throw new VoucherError("A redemption belongs to an order or a sale");
  const { count } = await t.giftVoucher.updateMany({
    where: { id: a.voucher.id, status: "ACTIVE", balanceCents: { gte: a.cents } },
    data: { balanceCents: { decrement: a.cents }, ...(a.orderId && { redeemedOrderIds: { push: a.orderId } }) },
  });
  if (!count) throw new VoucherError(`Gift voucher ${a.voucher.code} was just used somewhere else — check its balance and try again`);
  await t.giftVoucher.updateMany({ where: { id: a.voucher.id, balanceCents: { lte: 0 } }, data: { status: "REDEEMED" } });
  await t.voucherRedemption.create({ data: { voucherId: a.voucher.id, orderId: a.orderId ?? null, saleId: a.saleId ?? null, cents: a.cents } });
  await audit(t, a.actor, "voucher.redeem", {
    storeId: a.storeId ?? undefined, entity: "GiftVoucher", entityId: a.voucher.id,
    data: { code: maskVoucherCode(a.voucher.code), ...(a.orderId && { orderId: a.orderId }), ...(a.saleId && { saleId: a.saleId }), amount: a.cents, balanceAfter: a.voucher.balanceCents - a.cents },
  });
}

/**
 * Puts `cents` of a refund back onto a voucher (inside the refund's transaction): the balance goes up, a voucher that
 * was used up is active again unless it has expired, and a negative redemption row is written against the credit note.
 * A voucher is never cashed out: the allocation rule (lib/vouchers.allocateRefund) decides what comes back here.
 */
export async function restoreVoucherTx(t: Tx, a: { code: string; cents: number; actor: Actor; saleId: string; orderId?: string | null; storeId?: string | null }) {
  if (a.cents <= 0) return;
  const v = await t.giftVoucher.findUnique({ where: { code: a.code } });
  if (!v) throw new VoucherError(`Gift voucher ${a.code} is no longer on record — refund that part another way`);
  const updated = await t.giftVoucher.update({ where: { id: v.id }, data: { balanceCents: { increment: a.cents } } });
  if (updated.status === "REDEEMED" && updated.expiresAt > new Date()) await t.giftVoucher.update({ where: { id: v.id }, data: { status: "ACTIVE" } });
  if (updated.expiresAt <= new Date()) await queuePosting(t, "voucher", `${v.id}:expiry`); // back onto an expired voucher: more breakage
  await t.voucherRedemption.create({ data: { voucherId: v.id, orderId: a.orderId ?? null, saleId: a.saleId, cents: -a.cents } });
  await audit(t, a.actor, "voucher.refund", {
    storeId: a.storeId ?? undefined, entity: "GiftVoucher", entityId: v.id,
    data: { code: maskVoucherCode(v.code), saleId: a.saleId, ...(a.orderId && { orderId: a.orderId }), amount: a.cents, balanceAfter: updated.balanceCents },
  });
  return updated;
}

// Order-level sums count the positive rows only — what the order took from vouchers. A refund's negative rows sit
// against the credit note (and carry the order id for tracing) but never change what the order paid, so what's due
// in money on the order stays right after a return.
const TAKEN = { reversed: false, cents: { gt: 0 } } as const;

/** Money an order took from vouchers — what online payment, the till and refunds leave out. */
export async function voucherCentsOf(orderId: string, t: Tx | typeof db = db) {
  return (await t.voucherRedemption.aggregate({ where: { orderId, ...TAKEN }, _sum: { cents: true } }))._sum.cents ?? 0;
}

/** What's left to pay in money: the total less points and vouchers. */
export const orderDue = async (o: { id: string; totalCents: number; pointsRedeemed: number }) => o.totalCents - o.pointsRedeemed * 100 - (await voucherCentsOf(o.id));

/** The voucher part of an order as a "Gift voucher" tender line for the sale posted at handover or dispatch. */
export async function voucherTenderOf(orderId: string) {
  const reds = await db.voucherRedemption.findMany({ where: { orderId, ...TAKEN }, select: { cents: true, voucherId: true } });
  if (!reds.length) return null;
  const codes = await db.giftVoucher.findMany({ where: { id: { in: [...new Set(reds.map((r) => r.voucherId))] } }, select: { code: true } });
  return { method: "VOUCHER" as const, amountCents: reds.reduce((s, r) => s + r.cents, 0), reference: codes.map((c) => c.code).join(",") };
}

/** The vouchers applied to an order, for the order page. */
export const redemptionsOf = cache(async (orderId: string) => {
  const reds = await db.voucherRedemption.findMany({ where: { orderId, ...TAKEN }, select: { cents: true, voucherId: true } });
  if (!reds.length) return [];
  const byId = new Map((await db.giftVoucher.findMany({ where: { id: { in: reds.map((r) => r.voucherId) } }, select: { id: true, code: true } })).map((v) => [v.id, v.code]));
  return reds.map((r) => ({ code: byId.get(r.voucherId) ?? "", cents: r.cents }));
});

/** A cancelled order: money goes back onto the vouchers it used; a voucher it was buying is cancelled. */
export async function onOrderCancelledTx(t: Tx, orderId: string, actor: Actor) {
  const reds = await t.voucherRedemption.findMany({ where: { orderId, ...TAKEN } });
  for (const r of reds) {
    await t.voucherRedemption.update({ where: { id: r.id }, data: { reversed: true } });
    const v = await t.giftVoucher.update({ where: { id: r.voucherId }, data: { balanceCents: { increment: r.cents } } });
    if (v.status === "REDEEMED" && v.expiresAt > new Date()) await t.giftVoucher.update({ where: { id: v.id }, data: { status: "ACTIVE" } });
    if (v.expiresAt <= new Date()) await queuePosting(t, "voucher", `${v.id}:expiry`); // back onto an expired voucher: more breakage
    await audit(t, actor, "voucher.release", { entity: "GiftVoucher", entityId: v.id, data: { code: maskVoucherCode(v.code), orderId, amount: r.cents } });
  }
  const pending = await t.giftVoucher.updateMany({ where: { purchaseOrderId: orderId, status: "PENDING" }, data: { status: "CANCELLED" } });
  return { released: reds.length, cancelled: pending.count };
}

// ── Housekeeping and lookups ──────────────────────────────────────────────────

/** Daily: vouchers past their three years expire; purchases never paid for (their orders lapsed) are cancelled. */
export async function expireVouchers(now = new Date()) {
  const due = (await db.giftVoucher.findMany({ where: { status: "ACTIVE", expiresAt: { lt: now } }, select: { id: true } })).map((v) => v.id);
  const expired = await tx(async (t) => {
    for (const id of due) await queuePosting(t, "voucher", `${id}:expiry`); // what's left on it is breakage, in HQ's books
    return t.giftVoucher.updateMany({ where: { id: { in: due }, status: "ACTIVE" }, data: { status: "EXPIRED" } });
  });
  const lapsed = await db.giftVoucher.updateMany({ where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 2 * 86_400_000) } }, data: { status: "CANCELLED" } });
  return { expired: expired.count, lapsed: lapsed.count };
}

export const memberVouchers = (customerId: string) => db.giftVoucher.findMany({ where: { purchasedByCustomerId: customerId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, take: 20 });
export const voucherOfOrder = cache((orderId: string) => db.giftVoucher.findFirst({ where: { purchaseOrderId: orderId } }));

/** A public balance check by code (the code is the secret): amount left and expiry, nothing about who bought it. */
export async function voucherBalance(raw: string) {
  const code = normaliseVoucherCode(raw);
  if (!code) return null;
  const v = await db.giftVoucher.findUnique({ where: { code }, select: { code: true, amountCents: true, balanceCents: true, expiresAt: true, status: true } });
  return v && v.status !== "PENDING" && v.status !== "CANCELLED" ? v : null;
}

export { voucherApply };
