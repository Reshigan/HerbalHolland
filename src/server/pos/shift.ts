// Till shifts: open with a counted float, close with a denomination count (expected vs
// counted via finance.shiftCash) and a Z-report that is printable and emailed to the store.
import { background } from "@/server/background";
import { db } from "@/server/db";
import { shiftCash } from "@/server/finance";
import { audit, type Actor } from "@/server/audit";
import { sendEmail } from "@/server/email";
import { APP_URL, zReportEmail } from "@/server/email-templates";
import { countCash, DENOMINATIONS, TENDER_LABEL, tradeSummary } from "@/components/pos/lib/rules";
import { PosError, type PosStaff } from "./http";
import type { ZReport } from "./types";
import type { CashMovementKind, ExpenseCategory } from "@/generated/prisma/client";
import { getSettings } from "@/server/settings";
import { checkShifts, raiseAlerts } from "@/server/loss";
import { queuePosting } from "@/server/ledger/core";

const actor = (pos: PosStaff): Actor => ({ type: "USER", id: pos.user.id, name: pos.user.name });

export async function openShift(pos: PosStaff, floatCents: number, counts?: Record<string, number>) {
  const existing = await db.shift.findFirst({ where: { storeId: pos.device.storeId, deviceId: pos.device.id, closedAt: null } });
  if (existing) throw new PosError("A shift is already open on this till", 409);
  const shift = await db.shift.create({
    data: { storeId: pos.device.storeId, deviceId: pos.device.id, openedById: pos.user.id, openingFloatCents: floatCents },
  });
  await audit(db, actor(pos), "shift.open", { storeId: shift.storeId, entity: "Shift", entityId: shift.id, data: { floatCents, ...(counts && { counts }) } });
  return shift;
}

async function openShiftOnTill(pos: PosStaff, shiftId: string) {
  const shift = await db.shift.findUnique({ where: { id: shiftId } });
  if (!shift || shift.storeId !== pos.device.storeId || shift.deviceId !== pos.device.id) throw new PosError("That shift isn't open on this till", 404);
  if (shift.closedAt) throw new PosError("This shift is already closed", 409);
  return shift;
}

const MOVEMENT_MAX_CENTS = 5_000_000;

/**
 * Cash in or out of an open drawer, by a till manager, with a reason on record:
 * - PAID_OUT: petty cash or an emergency payment out of the drawer. It is booked as an expense paid from cash
 *   (credits cash, not the bank) and lowers what the drawer should hold.
 * - DROP: cash moved from the drawer to the safe mid-shift. It is still the shift's takings, so the close adds the
 *   drops back to the drawer count and expected cash doesn't change.
 * - CASH_IN: a float top-up (change from the safe). It raises the shift's opening float.
 */
export async function cashMovement(pos: PosStaff, shiftId: string, kind: CashMovementKind, amountCents: number, reason: string, category: ExpenseCategory = "OTHER") {
  const shift = await openShiftOnTill(pos, shiftId);
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MOVEMENT_MAX_CENTS) throw new PosError("Enter an amount between R0.01 and R50,000", 422);
  const why = reason.trim();
  if (!why) throw new PosError("Give a reason for the cash movement", 422);
  if (kind !== "CASH_IN") {
    const cash = await shiftCash(shift.id);
    // What can physically leave the drawer: what it should hold, less what's already gone to the safe.
    const inDrawer = cash.expectedCents - cash.droppedCents;
    if (amountCents > inDrawer) throw new PosError("That's more cash than the drawer should hold", 422, "OVER_DRAWER");
  }
  const by = pos.user.id;
  // One D1 batch, so the movement and its expense (or float top-up) land together or not at all.
  const expenseId = kind === "PAID_OUT" ? crypto.randomUUID() : null;
  const [move] = await db.$transaction([
    db.cashMovement.create({ data: { shiftId: shift.id, kind, amountCents, reason: why, byId: by, expenseId } }),
    ...(expenseId
      ? [db.expense.create({ data: { id: expenseId, storeId: shift.storeId, date: new Date(), category, description: `Till paid-out: ${why}`, amountCents, vatCents: 0, paidFromCash: true, createdById: by } })]
      : []),
    ...(kind === "CASH_IN" ? [db.shift.update({ where: { id: shift.id }, data: { openingFloatCents: { increment: amountCents } } })] : []),
  ]);
  if (move.expenseId) await queuePosting(db, "expense", move.expenseId);
  const action = { PAID_OUT: "cash.paid_out", DROP: "cash.drop", CASH_IN: "cash.cash_in" }[kind];
  await audit(db, actor(pos), action, { storeId: shift.storeId, entity: "Shift", entityId: shift.id, data: { amountCents, reason: why, movementId: move.id, ...(move.expenseId && { expenseId: move.expenseId, category }) } });
  return move;
}

export async function closeShift(pos: PosStaff, shiftId: string, counts: Record<string, number>, notes?: string) {
  const shift = await openShiftOnTill(pos, shiftId);
  const clean = Object.fromEntries(DENOMINATIONS.map((d) => [String(d), Math.max(0, Math.floor(counts[String(d)] ?? 0))]));
  const cash = await shiftCash(shift.id);
  // The shift's cash is what's left in the drawer plus what went to the safe during it.
  const drawer = countCash(clean);
  const counted = drawer + cash.droppedCents;
  // A count out by more than the cash-short tolerance needs a reason on record (without saying by how much: it's blind).
  const tolerance = (await getSettings()).loss.cashShortCents;
  if (Math.abs(counted - cash.expectedCents) > tolerance && !notes?.trim())
    throw new PosError("The count doesn't match what the till expects: count the drawer again, or add a note explaining the difference", 422, "NOTE_REQUIRED");
  const done = await db.shift.updateMany({
    where: { id: shift.id, closedAt: null },
    data: { closedAt: new Date(), closedById: pos.user.id, expectedCashCents: cash.expectedCents, countedCashCents: counted, notes: notes?.trim() || null },
  });
  if (!done.count) throw new PosError("This shift is already closed", 409);
  await queuePosting(db, "shift", shift.id);
  await audit(db, actor(pos), "shift.close", {
    storeId: shift.storeId,
    entity: "Shift",
    entityId: shift.id,
    data: { expected: cash.expectedCents, counted, drawer, dropped: cash.droppedCents, variance: counted - cash.expectedCents, counts: clean },
  });
  background(`cash-short check ${shift.id}`, checkShifts({ id: shift.id }, (await getSettings()).loss).then(raiseAlerts));
  const report = await zReport(shift.id);
  const to = pos.device.store.email;
  if (to) {
    background(`Z-report email ${shift.id}`, emailZReport(report, to));
    report.emailedTo = to;
  }
  return report;
}

export async function zReport(shiftId: string): Promise<ZReport> {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId }, include: { store: { include: { company: true } } } });
  const licensed = (await getSettings()).compliance.licensedOnly;
  const [kinds, tenders, refundTenders, units, users, device, closeLog, cash, dispensed, moves] = await Promise.all([
    db.sale.groupBy({
      by: ["kind", "channel"],
      where: { shiftId },
      _count: { _all: true },
      _sum: { totalCents: true, vatCents: true, discountCents: true, memberSavingsCents: true, pointsEarned: true },
    }),
    db.payment.groupBy({ by: ["method"], where: { sale: { shiftId } }, _sum: { amountCents: true }, _count: { _all: true } }),
    // Where the refunds' money went (a refund back to how they paid has a line per tender).
    db.payment.groupBy({ by: ["method"], where: { sale: { shiftId, kind: "REFUND" } }, _sum: { amountCents: true }, _count: { _all: true } }),
    db.saleLine.aggregate({ where: { sale: { shiftId, kind: "SALE" } }, _sum: { qty: true } }),
    db.user.findMany({ where: { id: { in: [shift.openedById, shift.closedById].filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    shift.deviceId ? db.device.findUnique({ where: { id: shift.deviceId }, select: { name: true, prefix: true } }) : null,
    db.auditLog.findFirst({ where: { action: "shift.close", entity: "Shift", entityId: shiftId }, orderBy: { at: "desc" } }),
    shiftCash(shiftId),
    // Licensed medicines dispensed in the shift (the Z-report's dispensing totals): sales, units, grams and value.
    licensed.length
      ? db.saleLine.findMany({ where: { sale: { shiftId, kind: "SALE" }, variant: { product: { regClass: { in: licensed } } } }, select: { saleId: true, qty: true, totalCents: true, variant: { select: { grams: true } } } })
      : [],
    db.cashMovement.findMany({ where: { shiftId }, orderBy: { createdAt: "asc" } }),
  ]);
  const moverIds = moves.map((m) => m.byId).filter((id) => !users.some((u) => u.id === id));
  if (moverIds.length) users.push(...(await db.user.findMany({ where: { id: { in: [...new Set(moverIds)] } }, select: { id: true, name: true } })));
  const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
  const sum = (rows: typeof kinds, f: (r: (typeof kinds)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const sales = kinds.filter((k) => k.kind === "SALE");
  const refunds = kinds.filter((k) => k.kind === "REFUND");
  const online = kinds.filter((k) => k.kind === "SALE" && k.channel === "ONLINE");
  const gross = sum(sales, (r) => r._sum.totalCents ?? 0);
  const vat = sum(sales, (r) => r._sum.vatCents ?? 0);
  const loyalty = tenders.find((t) => t.method === "LOYALTY")?._sum.amountCents ?? 0;
  const counts = ((closeLog?.data as { counts?: Record<string, number> } | null)?.counts ?? null) as Record<string, number> | null;
  const label = (method: string) => (method === "VOUCHER" ? "Gift vouchers" : (TENDER_LABEL[method] ?? method));

  return {
    shiftId: shift.id,
    closed: !!shift.closedAt,
    store: { code: shift.store.code, name: shift.store.name, legalName: shift.store.company.legalName, vatNumber: shift.store.company.vatNumber },
    device,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
    openedBy: name(shift.openedById) ?? "—",
    closedBy: name(shift.closedById),
    sales: {
      count: sum(sales, (r) => r._count._all),
      grossCents: gross,
      vatCents: vat,
      netCents: gross - vat,
      discountCents: sum(sales, (r) => r._sum.discountCents ?? 0),
      memberSavingsCents: sum(kinds, (r) => r._sum.memberSavingsCents ?? 0),
      units: units._sum.qty ?? 0,
    },
    refunds: { count: sum(refunds, (r) => r._count._all), totalCents: -sum(refunds, (r) => r._sum.totalCents ?? 0) },
    refundTenders: refundTenders
      .map((t) => ({ method: t.method, label: label(t.method), amountCents: -(t._sum.amountCents ?? 0), count: t._count._all }))
      .filter((t) => t.amountCents !== 0)
      .sort((a, b) => b.amountCents - a.amountCents),
    online: { count: sum(online, (r) => r._count._all), grossCents: sum(online, (r) => r._sum.totalCents ?? 0) },
    tenders: tenders
      .map((t) => ({ method: t.method, label: label(t.method), amountCents: t._sum.amountCents ?? 0, count: t._count._all }))
      .sort((a, b) => b.amountCents - a.amountCents),
    points: { issued: sum(kinds, (r) => r._sum.pointsEarned ?? 0), redeemed: Math.round(loyalty / 100) },
    cash: {
      floatCents: shift.openingFloatCents,
      cashNetCents: cash.cashSalesCents,
      expectedCents: shift.expectedCashCents ?? cash.expectedCents,
      countedCents: shift.countedCashCents,
      varianceCents: shift.countedCashCents != null ? shift.countedCashCents - (shift.expectedCashCents ?? cash.expectedCents) : null,
      counts,
      paidOutCents: cash.paidOutCents,
      droppedCents: cash.droppedCents,
      cashInCents: cash.cashInCents,
    },
    movements: moves.map((m) => ({ kind: m.kind, amountCents: m.amountCents, reason: m.reason, by: name(m.byId) ?? "—", at: m.createdAt.toISOString() })),
    takingsCents: sum(kinds, (r) => r._sum.totalCents ?? 0),
    dispensing: {
      count: new Set(dispensed.map((l) => l.saleId)).size,
      units: dispensed.reduce((a, l) => a + l.qty, 0),
      grams: Math.round(dispensed.reduce((a, l) => a + (l.variant.grams ?? 0) * l.qty, 0) * 10) / 10,
      cents: dispensed.reduce((a, l) => a + l.totalCents, 0),
    },
    // Trade sales (WHOLESALE) in the shift, and the part invoiced on account, which is not money: the cash-up
    // (shiftCash) counts CASH tenders only, so "On account" never changes what's expected in the drawer.
    trade: tradeSummary(
      kinds.map((k) => ({ kind: k.kind, channel: k.channel, count: k._count._all, totalCents: k._sum.totalCents ?? 0, vatCents: k._sum.vatCents ?? 0 })),
      tenders.map((t) => ({ method: t.method, amountCents: t._sum.amountCents ?? 0 })),
    ),
    notes: shift.notes,
    emailedTo: null,
  };
}

/** The X-report as a blind count needs it: nothing that gives away what the drawer should hold (managers see it all). */
export function blindReport(r: ZReport): ZReport {
  if (r.closed) return r;
  return {
    ...r,
    blind: true,
    tenders: r.tenders.filter((t) => t.method !== "CASH"),
    refundTenders: r.refundTenders?.filter((t) => t.method !== "CASH"),
    cash: { ...r.cash, cashNetCents: 0, expectedCents: 0, varianceCents: null },
  };
}

/** Most recent shift on this till (open or closed) for re-printing. */
export async function lastShiftId(device: { id: string; storeId: string }) {
  const s = await db.shift.findFirst({ where: { storeId: device.storeId, deviceId: device.id }, orderBy: { openedAt: "desc" }, select: { id: true } });
  return s?.id ?? null;
}

/** The store's copy of the cash-up (email-templates.ts), linking to the printable Z-report in the back office. */
async function emailZReport(r: ZReport, to: string) {
  await sendEmail({ to, ...zReportEmail(r, { url: `${APP_URL()}/store/${r.store.code}/cash-ups/${r.shiftId}/z-report` }) });
}
