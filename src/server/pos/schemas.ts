// Request schemas shared by the /api/pos/* route handlers.
import { z } from "zod";
import { normaliseVoucherCode } from "@/lib/vouchers";

export const AgeCheck = z.enum(["NONE", "ID_SIGHTED", "ID_NUMBER", "VERIFIED"]);

export const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Expected a client UUID");

export const Items = z.array(z.object({ variantId: z.string().min(1), qty: z.number().int().min(1).max(999) })).max(200);

export const Tender = z
  .object({
    method: z.enum(["CARD", "CASH", "PAYSHAP", "EFT", "VOUCHER", "ACCOUNT"]),
    amountCents: z.number().int().min(1, "Tender amounts must be positive"),
    tenderedCents: z.number().int().min(0).optional(),
    changeCents: z.number().int().min(0).optional(),
    provider: z.string().max(40).optional(),
    reference: z.string().trim().max(60).optional(),
    cardBrand: z.string().max(20).optional(),
    cardLast4: z.string().regex(/^\d{4}$/).optional(),
  })
  // A gift voucher tender carries the voucher's code; it is redeemed when the sale posts.
  .refine((t) => t.method !== "VOUCHER" || !!normaliseVoucherCode(t.reference ?? ""), { message: "A gift voucher tender needs the voucher code (HH-XXXX-XXXX-XXXX)", path: ["reference"] });

/** Money tenders only (order handovers): a trade account's terms (ACCOUNT) belong to trade sales. */
export const MoneyTender = Tender.refine((t) => t.method !== "ACCOUNT", { message: "On account is for trade sales only", path: ["method"] });

/** A till sale as posted (or synced from the outbox): sales.postPosSale's input. */
export const SaleBody = z
  .object({
    id: Uuid,
    number: z.string().regex(/^[A-Z0-9]{2,12}-[A-Z0-9]{1,3}\d{3,9}$/, "Invalid receipt number"),
    seq: z.number().int().min(1).optional(),
    createdAt: z.string().datetime({ offset: true }).optional(),
    offline: z.boolean().optional(),
    shiftId: z.string().nullish(),
    customerId: z.string().nullish(),
    memberNo: z.string().trim().max(20).nullish(),
    lines: z.array(z.object({ variantId: z.string().min(1), qty: z.number().int().min(1).max(999), unitPriceCents: z.number().int().min(0).optional() })).min(1, "The sale has no items").max(200),
    promoCode: z.string().trim().max(40).nullish(),
    pointsRedeemed: z.number().int().min(0).optional(),
    payments: z.array(Tender).max(10),
    ageCheck: AgeCheck.optional(),
    buyer: z.object({ name: z.string().trim().min(1), address: z.string().trim().min(1), vatNumber: z.string().trim().optional() }).nullish(),
    invoiceEmail: z.union([z.literal(""), z.string().trim().email("That email doesn't look right")]).nullish(),
    staffId: z.string().optional(), // who rang it up (offline sales sync later under whoever is signed in)
    soldById: z.string().min(1).max(60).nullish(), // who built the basket when a dispenser completed it (commission credit)
    /** Trade-sale mode: the trade account buying (sales.postTradeSale — WHOLESALE, ex-VAT prices, ACCOUNT tender allowed). */
    trade: z.object({ tradeAccountId: z.string().min(1) }).nullish(),
  })
  // A gift voucher is redeemed on the server as the sale posts, so it needs the connection: a sale rung up offline and
  // queued can never carry one. The operator rings that sale up again with another tender and discards the queued one.
  .refine((b) => !b.offline || !b.payments.some((p) => p.method === "VOUCHER"), {
    message: "Gift vouchers can't be taken on an offline sale. This queued sale needs another tender: ring it up again and discard this one",
    path: ["payments"],
  })
  // A trade sale is priced, checked and invoiced on the server (the account's ledger): never queued offline.
  .refine((b) => !b.offline || !b.trade, {
    message: "Trade sales need a connection, so this queued trade sale can't be posted: ring it up again online and discard this one",
    path: ["trade"],
  })
  // On account is a trade account's terms: only a trade sale carries it, and never together with points, a member or a voucher.
  .refine((b) => !!b.trade || !b.payments.some((p) => p.method === "ACCOUNT"), { message: "On account is for trade sales only: choose the trade account first", path: ["payments"] })
  .refine((b) => !b.trade || (!b.customerId && !b.memberNo && !(b.pointsRedeemed ?? 0) && !b.payments.some((p) => p.method === "VOUCHER")), {
    message: "A trade sale is for the trade account: no member, points or gift vouchers",
    path: ["trade"],
  });
