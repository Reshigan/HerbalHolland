// SAHPRA patient register for a store's members, and the Schedule 6 dispensing
// register (every licensed sale line with patient, authorisation, batch and dispenser).
import { db } from "@/server/db";
import { inBatches } from "@/lib/json-list";
import { gramsSince } from "@/server/compliance";
import { getSettings } from "@/server/settings";
import { addDays, type DateRange } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { likeTerm } from "@/lib/search";

export type AuthView = "active" | "expiring" | "expired" | "revoked";

export function authWhere(storeId: string, view: AuthView, q: string, now = new Date()): Prisma.PatientAuthWhereInput {
  const soon = addDays(now, 30);
  const byView: Record<AuthView, Prisma.PatientAuthWhereInput> = {
    active: { status: "ACTIVE", validFrom: { lte: now }, validTo: { gte: now } },
    expiring: { status: "ACTIVE", validTo: { gte: now, lte: soon } },
    expired: { status: "ACTIVE", validTo: { lt: now } },
    revoked: { status: "REVOKED" },
  };
  const words = q.split(/\s+/).filter(Boolean).map((w) => likeTerm(w));
  return {
    AND: [
      { customer: { homeStoreId: storeId } },
      byView[view],
      ...words.map((w) => ({
        OR: [
          { authNumber: { contains: w } },
          { prescriber: { contains: w } },
          { customer: { firstName: { contains: w } } },
          { customer: { lastName: { contains: w } } },
          { customer: { memberNo: { contains: w } } },
        ],
      })),
    ],
  };
}

export async function authRegister(storeId: string, view: AuthView, q: string, page: number, pageSize: number) {
  const where = authWhere(storeId, view, q);
  const [total, rows, settings] = await Promise.all([
    db.patientAuth.count({ where }),
    db.patientAuth.findMany({
      where,
      orderBy: view === "expiring" || view === "active" ? { validTo: "asc" } : { validTo: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { customer: { select: { id: true, firstName: true, lastName: true, memberNo: true } } },
    }),
    getSettings(),
  ]);
  const since = addDays(new Date(), -30);
  const used = await Promise.all(rows.map((r) => gramsSince(r.customerId, settings.compliance.licensedOnly, since)));
  const verifiers = await db.user.findMany({ where: { id: { in: rows.map((r) => r.verifiedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const vName = new Map(verifiers.map((u) => [u.id, u.name]));
  return { total, rows: rows.map((r, i) => ({ ...r, usedGrams: used[i], verifiedBy: r.verifiedById ? vName.get(r.verifiedById) ?? null : null })) };
}

type Alloc = { batchId: string; qty: number }[];

/** Licensed sale lines at the store in the range, newest first. `take` undefined = all (CSV). */
export async function dispensingRegister(storeId: string, r: DateRange, page = 1, take?: number) {
  const classes = (await getSettings()).compliance.licensedOnly;
  const where: Prisma.SaleLineWhereInput = {
    sale: { storeId, createdAt: { gte: r.start, lt: r.end } },
    variant: { product: { regClass: { in: classes } } },
  };
  const [total, lines] = await Promise.all([
    db.saleLine.count({ where }),
    db.saleLine.findMany({
      where,
      orderBy: [{ sale: { createdAt: "desc" } }, { id: "asc" }],
      skip: take ? (page - 1) * take : 0,
      take: take ?? 20_000,
      include: {
        sale: { select: { number: true, kind: true, createdAt: true, customerId: true, staff: { select: { name: true, canDispense: true } }, customer: { select: { firstName: true, lastName: true, memberNo: true } } } },
        variant: { select: { sku: true, name: true, grams: true, product: { select: { name: true } } } },
      },
    }),
  ]);
  const customerIds = [...new Set(lines.map((l) => l.sale.customerId).filter((x): x is string => !!x))];
  const batchIds = [...new Set(lines.flatMap((l) => ((l.allocations as Alloc | null) ?? []).map((a) => a.batchId)))];
  const [auths, batches] = await Promise.all([
    inBatches(customerIds, (part) => db.patientAuth.findMany({ where: { customerId: { in: part } }, orderBy: { validTo: "desc" } })),
    inBatches(batchIds, (part) => db.batch.findMany({ where: { id: { in: part } }, select: { id: true, code: true } })),
  ]);
  const code = new Map(batches.map((b) => [b.id, b.code]));
  return {
    total,
    rows: lines.map((l) => {
      const at = l.sale.createdAt;
      const auth = auths.find((a) => a.customerId === l.sale.customerId && a.validFrom <= at && a.validTo >= at && a.status === "ACTIVE") ?? auths.find((a) => a.customerId === l.sale.customerId && a.validFrom <= at && a.validTo >= at);
      const sign = l.sale.kind === "REFUND" ? -1 : 1;
      return {
        id: l.id,
        at,
        saleNumber: l.sale.number,
        refund: l.sale.kind === "REFUND",
        patient: l.sale.customer ? `${l.sale.customer.firstName} ${l.sale.customer.lastName ?? ""}`.trim() : null,
        memberNo: l.sale.customer?.memberNo ?? null,
        authNumber: auth?.authNumber ?? null,
        prescriber: auth ? `${auth.prescriber} (${auth.prescriberRegNo})` : null,
        product: `${l.variant.product.name} · ${l.variant.name}`,
        sku: l.variant.sku,
        batches: ((l.allocations as Alloc | null) ?? []).map((a) => `${code.get(a.batchId) ?? "?"}×${a.qty}`).join(", "),
        qty: sign * l.qty,
        grams: sign * l.qty * (l.variant.grams ?? 0),
        dispenser: l.sale.staff?.name ?? null,
        dispenserAuthorised: l.sale.staff?.canDispense ?? false,
      };
    }),
  };
}
