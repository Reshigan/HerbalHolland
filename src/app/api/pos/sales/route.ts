// Till sales: history (GET) and posting (POST, idempotent on the client-generated Sale.id,
// so queued offline sales can be retried safely). Domain: sales.postPosSale.
import { z } from "zod";
import { db } from "@/server/db";
import { postPosSale, type PosSaleInput } from "@/server/sales";
import { quote } from "@/server/pricing";
import { json, readBody, withStaff, PosError } from "@/server/pos/http";
import { AgeCheck, Tender, Uuid } from "@/server/pos/schemas";
import { receipt, salesHistory } from "@/server/pos/receipts";

export const GET = withStaff(async (req, pos) => {
  const sp = new URL(req.url).searchParams;
  return json(await salesHistory(pos.device.storeId, { q: sp.get("q") ?? undefined, before: sp.get("before") ?? undefined }));
});

const Body = z.object({
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
});

export const POST = withStaff(async (req, pos) => {
  const b = await readBody(req, Body);
  const storeId = pos.device.storeId;

  const existing = await db.sale.findUnique({ where: { id: b.id }, select: { storeId: true } });
  if (existing) {
    if (existing.storeId !== storeId) throw new PosError("That sale belongs to another store", 409);
    return json({ receipt: await receipt(b.id, storeId), duplicate: true, invoiceTo: null });
  }

  // Attribution: offline sales keep the staff member who rang them up (same store, active).
  let staff = { id: pos.user.id, name: pos.user.name };
  if (b.offline && b.staffId && b.staffId !== pos.user.id) {
    const u = await db.user.findFirst({ where: { id: b.staffId, storeId, active: true }, select: { id: true, name: true } });
    if (u) staff = u;
  }

  const open = await db.shift.findFirst({ where: { storeId, deviceId: pos.device.id, closedAt: null }, select: { id: true } });
  let shiftId: string | null;
  if (!b.offline) {
    if (!open) throw new PosError("Open a shift on this till before selling", 409, "NO_SHIFT");
    shiftId = open.id;
  } else {
    const given = b.shiftId ? await db.shift.findFirst({ where: { id: b.shiftId, storeId }, select: { id: true } }) : null;
    shiftId = given?.id ?? open?.id ?? null;
  }

  // Medicines Act s18A: points (an incentive) can't pay for medicines (licensed, or the noIncentives classes).
  if (!b.offline && b.pointsRedeemed) {
    const q = await quote({ storeId, channel: "POS", items: b.lines, code: b.promoCode, customerId: b.customerId });
    const eligible = q.lines.filter((l) => !l.noEarn).reduce((s, l) => s + l.totalCents, 0);
    if (b.pointsRedeemed * 100 > eligible) throw new PosError("Points can't be used towards medicines (licensed or CBD supplements)", 422);
  }

  const now = Date.now();
  const createdAt = b.createdAt && Date.parse(b.createdAt) < now ? b.createdAt : undefined;
  const input: PosSaleInput = {
    id: b.id,
    number: b.number,
    seq: b.seq,
    createdAt,
    offline: !!b.offline,
    shiftId,
    customerId: b.customerId ?? null,
    memberNo: b.memberNo ?? null,
    lines: b.lines,
    promoCode: b.promoCode || null,
    pointsRedeemed: b.pointsRedeemed ?? 0,
    payments: b.payments,
    ageCheck: b.ageCheck,
    buyer: b.buyer ?? null,
    invoiceEmail: b.invoiceEmail || null,
  };
  const r = await postPosSale(input, { storeId, deviceId: pos.device.id, staffId: staff.id, staffName: staff.name });
  const dto = await receipt(r.sale.id, storeId);
  const customerEmail = b.customerId ? (await db.customer.findUnique({ where: { id: b.customerId }, select: { email: true } }))?.email : null;
  return json({ receipt: dto, duplicate: r.duplicate, invoiceTo: b.invoiceEmail || customerEmail || null }, r.duplicate ? 200 : 201);
});
