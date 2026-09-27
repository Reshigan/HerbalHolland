// Till shifts: open with a counted float, close with a denomination count (expected vs
// counted via finance.shiftCash) and a Z-report that is printable and emailed to the store.
import { db } from "@/server/db";
import { shiftCash } from "@/server/finance";
import { audit, type Actor } from "@/server/audit";
import { sendEmail, emailLayout, esc } from "@/server/email";
import { zar } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { countCash, denomLabel, DENOMINATIONS, TENDER_LABEL } from "@/components/pos/lib/rules";
import { PosError, type PosStaff } from "./http";
import type { ZReport } from "./types";

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

export async function closeShift(pos: PosStaff, shiftId: string, counts: Record<string, number>, notes?: string) {
  const shift = await db.shift.findUnique({ where: { id: shiftId } });
  if (!shift || shift.storeId !== pos.device.storeId || shift.deviceId !== pos.device.id) throw new PosError("That shift isn't open on this till", 404);
  if (shift.closedAt) throw new PosError("This shift is already closed", 409);
  const clean = Object.fromEntries(DENOMINATIONS.map((d) => [String(d), Math.max(0, Math.floor(counts[String(d)] ?? 0))]));
  const counted = countCash(clean);
  const cash = await shiftCash(shift.id);
  const done = await db.shift.updateMany({
    where: { id: shift.id, closedAt: null },
    data: { closedAt: new Date(), closedById: pos.user.id, expectedCashCents: cash.expectedCents, countedCashCents: counted, notes: notes?.trim() || null },
  });
  if (!done.count) throw new PosError("This shift is already closed", 409);
  await audit(db, actor(pos), "shift.close", {
    storeId: shift.storeId,
    entity: "Shift",
    entityId: shift.id,
    data: { expected: cash.expectedCents, counted, variance: counted - cash.expectedCents, counts: clean },
  });
  const report = await zReport(shift.id);
  const to = pos.device.store.email;
  if (to) {
    emailZReport(report, to).catch((e) => console.error("[pos] Z-report email failed", shift.id, e));
    report.emailedTo = to;
  }
  return report;
}

export async function zReport(shiftId: string): Promise<ZReport> {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId }, include: { store: { include: { company: true } } } });
  const [kinds, tenders, units, users, device, closeLog, cash] = await Promise.all([
    db.sale.groupBy({
      by: ["kind", "channel"],
      where: { shiftId },
      _count: { _all: true },
      _sum: { totalCents: true, vatCents: true, discountCents: true, pointsEarned: true },
    }),
    db.payment.groupBy({ by: ["method"], where: { sale: { shiftId } }, _sum: { amountCents: true }, _count: { _all: true } }),
    db.saleLine.aggregate({ where: { sale: { shiftId, kind: "SALE" } }, _sum: { qty: true } }),
    db.user.findMany({ where: { id: { in: [shift.openedById, shift.closedById].filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    shift.deviceId ? db.device.findUnique({ where: { id: shift.deviceId }, select: { name: true, prefix: true } }) : null,
    db.auditLog.findFirst({ where: { action: "shift.close", entity: "Shift", entityId: shiftId }, orderBy: { at: "desc" } }),
    shiftCash(shiftId),
  ]);
  const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
  const sum = (rows: typeof kinds, f: (r: (typeof kinds)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const sales = kinds.filter((k) => k.kind === "SALE");
  const refunds = kinds.filter((k) => k.kind === "REFUND");
  const online = kinds.filter((k) => k.kind === "SALE" && k.channel === "ONLINE");
  const gross = sum(sales, (r) => r._sum.totalCents ?? 0);
  const vat = sum(sales, (r) => r._sum.vatCents ?? 0);
  const loyalty = tenders.find((t) => t.method === "LOYALTY")?._sum.amountCents ?? 0;
  const counts = ((closeLog?.data as { counts?: Record<string, number> } | null)?.counts ?? null) as Record<string, number> | null;

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
      units: units._sum.qty ?? 0,
    },
    refunds: { count: sum(refunds, (r) => r._count._all), totalCents: -sum(refunds, (r) => r._sum.totalCents ?? 0) },
    online: { count: sum(online, (r) => r._count._all), grossCents: sum(online, (r) => r._sum.totalCents ?? 0) },
    tenders: tenders
      .map((t) => ({ method: t.method, label: TENDER_LABEL[t.method] ?? t.method, amountCents: t._sum.amountCents ?? 0, count: t._count._all }))
      .sort((a, b) => b.amountCents - a.amountCents),
    points: { issued: sum(kinds, (r) => r._sum.pointsEarned ?? 0), redeemed: Math.round(loyalty / 100) },
    cash: {
      floatCents: shift.openingFloatCents,
      cashNetCents: cash.cashSalesCents,
      expectedCents: shift.expectedCashCents ?? cash.expectedCents,
      countedCents: shift.countedCashCents,
      varianceCents: shift.countedCashCents != null ? shift.countedCashCents - (shift.expectedCashCents ?? cash.expectedCents) : null,
      counts,
    },
    takingsCents: sum(kinds, (r) => r._sum.totalCents ?? 0),
    notes: shift.notes,
    emailedTo: null,
  };
}

/** Most recent shift on this till (open or closed) for re-printing. */
export async function lastShiftId(device: { id: string; storeId: string }) {
  const s = await db.shift.findFirst({ where: { storeId: device.storeId, deviceId: device.id }, orderBy: { openedAt: "desc" }, select: { id: true } });
  return s?.id ?? null;
}

async function emailZReport(r: ZReport, to: string) {
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:5px 0;border-bottom:1px solid #EFE9E3;color:#4A403A">${esc(label)}</td><td align="right" style="padding:5px 0;border-bottom:1px solid #EFE9E3">${strong ? `<b>${value}</b>` : value}</td></tr>`;
  const variance = r.cash.varianceCents ?? 0;
  const body = `
<p style="margin:0 0 16px;color:#6B5F57;font-size:14px;line-height:21px">${esc(r.store.legalName)} · Herbal Holland ${esc(r.store.name)} (${esc(r.store.code)})${r.device ? ` · ${esc(r.device.name)}` : ""}<br/>
Opened ${fmtDateTime(r.openedAt)} by ${esc(r.openedBy)}${r.closedAt ? `<br/>Closed ${fmtDateTime(r.closedAt)} by ${esc(r.closedBy ?? "—")}` : ""}</p>
<table role="presentation" width="100%" style="font-size:14px">
${row("Sales", `${r.sales.count} · ${zar(r.sales.grossCents)}`, true)}
${row("VAT included", zar(r.sales.vatCents))}
${row("Net of VAT", zar(r.sales.netCents))}
${row("Discounts given", zar(r.sales.discountCents))}
${row("Refunds", `${r.refunds.count} · ${zar(r.refunds.totalCents)}`)}
${r.tenders.map((t) => row(t.label, zar(t.amountCents))).join("")}
${row("Points issued / redeemed", `${fmtPoints(r.points.issued)} / ${fmtPoints(r.points.redeemed)}`)}
${row("Cash expected in drawer", zar(r.cash.expectedCents))}
${row("Cash counted", r.cash.countedCents != null ? zar(r.cash.countedCents) : "—")}
${row("Variance", `${variance > 0 ? "+" : ""}${zar(variance)}`, true)}
</table>${r.notes ? `<p style="margin:14px 0 0;font-size:13px;color:#6B5F57">Notes: ${esc(r.notes)}</p>` : ""}`;
  const text = [
    `Z-report ${r.store.name} (${r.store.code})`,
    `Sales ${r.sales.count} · ${zar(r.sales.grossCents)} (VAT ${zar(r.sales.vatCents)})`,
    `Refunds ${r.refunds.count} · ${zar(r.refunds.totalCents)}`,
    ...r.tenders.map((t) => `${t.label} ${zar(t.amountCents)}`),
    `Cash expected ${zar(r.cash.expectedCents)} · counted ${r.cash.countedCents != null ? zar(r.cash.countedCents) : "—"} · variance ${zar(variance)}`,
    ...(r.cash.counts ? [DENOMINATIONS.filter((d) => r.cash.counts![String(d)]).map((d) => `${denomLabel(d)}×${r.cash.counts![String(d)]}`).join(", ")] : []),
  ].join("\n");
  await sendEmail({
    to,
    subject: `Z-report — ${r.store.name} ${r.device ? `(${r.device.name}) ` : ""}${fmtDateTime(r.closedAt ?? r.openedAt)}`,
    text,
    html: emailLayout({ preheader: `Takings ${zar(r.takingsCents)} · variance ${zar(variance)}`, heading: `Z-report · ${r.store.name}`, body }),
  });
}
