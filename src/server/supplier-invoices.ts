// Supplier invoices: what a store owes its suppliers. An outside supplier's is captured with a photo or PDF of the
// invoice from Finance → Supplier invoices, and paid or queried there. A stock order (from an HQ distribution centre or
// another store) is put on automatically when it's received (recordStatementInvoice): the stock order is its tax
// invoice and it settles on the month's franchise statement, so it's never paid on its own.
// HQ Finance sees them per store (scoped). Files go through the storage service and are only ever served through the app.
import { createHash, randomUUID } from "node:crypto";
import { db, tx, type Tx } from "./db";
import { audit, SYSTEM, type Actor } from "./audit";
import { putObject } from "./storage";
import { extFor, sniffType, type UploadType } from "@/lib/files";
import { MAX_INVOICE_BYTES, statementTerms } from "@/lib/supplier-invoice-rules";
import { vatOnExcl } from "@/lib/money";
import { addDays, dayKey } from "@/lib/format";
import type { Prisma, SupplierInvoiceStatus } from "@/generated/prisma/client";

export class SupplierInvoiceError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

/** Invoices are photos or PDFs up to 8 MB. */
export { MAX_INVOICE_BYTES };
const INVOICE_TYPES: UploadType[] = ["image/jpeg", "image/png", "application/pdf"];

export const STATUS_LABEL: Record<SupplierInvoiceStatus, string> = { DUE: "Due", PAID: "Paid", QUERIED: "Queried" };

/** A DATE column value from a YYYY-MM-DD day. */
const dateCol = (day: string) => new Date(`${day}T00:00:00Z`);
const asDay = (d: Date) => d.toISOString().slice(0, 10);

export type CaptureInput = {
  storeId: string;
  storeCode: string;
  supplierName: string;
  number: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  totalCents: number; // incl. VAT
  vatCents: number;
  note?: string | null;
  file: File;
};

/** Checks the file's bytes (never its name or the browser's type) and stores it; returns what the Upload row needs. */
async function storeInvoiceFile(a: { storeCode: string; storeId: string; file: File; day: string }, actorId: string) {
  if (!a.file.size) throw new SupplierInvoiceError("Add a photo or PDF of the invoice", "file");
  if (a.file.size > MAX_INVOICE_BYTES) throw new SupplierInvoiceError("The file is over 8 MB — take the photo again or use a smaller PDF", "file");
  const bytes = new Uint8Array(await a.file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type || !INVOICE_TYPES.includes(type)) throw new SupplierInvoiceError("The invoice must be a JPEG or PNG photo, or a PDF", "file");
  const key = `supplier-invoices/${a.storeCode}/${a.day.slice(0, 7)}/${randomUUID()}.${extFor(type)}`;
  await putObject(key, bytes, type);
  return { key, fileName: a.file.name.slice(0, 120) || `invoice.${extFor(type)}`, contentType: type, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), storeId: a.storeId, uploadedById: actorId };
}

export async function captureSupplierInvoice(a: CaptureInput, actor: Actor & { id: string }) {
  const supplierName = a.supplierName.trim().replace(/\s+/g, " ").slice(0, 120);
  const number = a.number.trim().replace(/\s+/g, " ").slice(0, 60);
  if (supplierName.length < 2) throw new SupplierInvoiceError("Enter the supplier's name", "supplierName");
  if (!number) throw new SupplierInvoiceError("Enter the invoice number", "number");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.invoiceDate)) throw new SupplierInvoiceError("Choose the invoice date", "invoiceDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dueDate)) throw new SupplierInvoiceError("Choose the due date", "dueDate");
  const today = dayKey(new Date());
  if (a.invoiceDate > today) throw new SupplierInvoiceError("The invoice date can't be in the future", "invoiceDate");
  if (a.invoiceDate < dayKey(addDays(new Date(), -400))) throw new SupplierInvoiceError("That's more than a year ago — check the date", "invoiceDate");
  if (a.dueDate < a.invoiceDate) throw new SupplierInvoiceError("The due date can't be before the invoice date", "dueDate");
  if (!Number.isInteger(a.totalCents) || a.totalCents <= 0 || a.totalCents > 100_000_000) throw new SupplierInvoiceError("Enter the invoice total including VAT", "total");
  if (!Number.isInteger(a.vatCents) || a.vatCents < 0 || a.vatCents > a.totalCents) throw new SupplierInvoiceError("VAT can't be more than the total", "vat");
  if (await db.supplierInvoice.count({ where: { storeId: a.storeId, supplierName: { equals: supplierName, mode: "insensitive" }, number: { equals: number, mode: "insensitive" } } }))
    throw new SupplierInvoiceError(`Invoice ${number} from ${supplierName} is already captured`, "number");

  const file = await storeInvoiceFile({ storeCode: a.storeCode, storeId: a.storeId, file: a.file, day: a.invoiceDate }, actor.id);
  const inv = await tx(async (t) => {
    const upload = await t.upload.create({ data: file });
    const row = await t.supplierInvoice.create({
      data: {
        storeId: a.storeId, supplierName, number, invoiceDate: dateCol(a.invoiceDate), dueDate: dateCol(a.dueDate), totalCents: a.totalCents, vatCents: a.vatCents,
        uploadId: upload.id, note: a.note?.trim().slice(0, 300) || null, createdById: actor.id,
      },
    });
    await audit(t, actor, "supplier_invoice.create", { storeId: a.storeId, entity: "SupplierInvoice", entityId: row.id, data: { supplierName, number, totalCents: a.totalCents, vatCents: a.vatCents, dueDate: a.dueDate } });
    return row;
  });
  return inv;
}

export async function paySupplierInvoice(id: string, storeId: string, a: { paidOn?: string | null; note?: string | null }, actor: Actor & { id: string }) {
  const inv = await db.supplierInvoice.findFirst({ where: { id, storeId } });
  if (!inv) throw new SupplierInvoiceError("Invoice not found");
  if (inv.status === "PAID") throw new SupplierInvoiceError(`${inv.number} is already marked paid`);
  if (inv.onStatement) throw new SupplierInvoiceError(`${inv.number} settles on the franchise statement — there's nothing to pay separately`);
  const paidAt = a.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(a.paidOn) ? new Date(`${a.paidOn}T12:00:00+02:00`) : new Date();
  if (paidAt > addDays(new Date(), 1)) throw new SupplierInvoiceError("The payment date can't be in the future", "paidOn");
  const note = a.note?.trim().slice(0, 300) || null;
  await db.supplierInvoice.update({ where: { id }, data: { status: "PAID", paidAt, paidById: actor.id, note: note ?? inv.note } });
  await audit(db, actor, "supplier_invoice.pay", { storeId, entity: "SupplierInvoice", entityId: id, data: { number: inv.number, supplierName: inv.supplierName, totalCents: inv.totalCents, paidAt, note } });
  return inv;
}

export async function querySupplierInvoice(id: string, storeId: string, note: string, actor: Actor & { id: string }) {
  const inv = await db.supplierInvoice.findFirst({ where: { id, storeId } });
  if (!inv) throw new SupplierInvoiceError("Invoice not found");
  if (inv.status === "PAID") throw new SupplierInvoiceError(`${inv.number} is paid — nothing to query`);
  if (inv.onStatement) throw new SupplierInvoiceError(`${inv.number} is for what you counted in — take any problem with it up with HQ`);
  const text = note.trim().slice(0, 300);
  if (text.length < 3) throw new SupplierInvoiceError("Say what's wrong with the invoice", "note");
  await db.supplierInvoice.update({ where: { id }, data: { status: "QUERIED", note: text } });
  await audit(db, actor, "supplier_invoice.query", { storeId, entity: "SupplierInvoice", entityId: id, data: { number: inv.number, supplierName: inv.supplierName, note: text } });
  return inv;
}

/** Back to due once a query is settled. */
export async function reopenSupplierInvoice(id: string, storeId: string, actor: Actor & { id: string }) {
  const inv = await db.supplierInvoice.findFirst({ where: { id, storeId } });
  if (!inv) throw new SupplierInvoiceError("Invoice not found");
  if (inv.status !== "QUERIED") throw new SupplierInvoiceError(`${inv.number} isn't queried`);
  await db.supplierInvoice.update({ where: { id }, data: { status: "DUE" } });
  await audit(db, actor, "supplier_invoice.reopen", { storeId, entity: "SupplierInvoice", entityId: id, data: { number: inv.number } });
  return inv;
}

export type InvoiceFilters = { status?: SupplierInvoiceStatus | null; q?: string; storeIds: string[] };

export function invoiceWhere(f: InvoiceFilters): Prisma.SupplierInvoiceWhereInput {
  const q = f.q?.trim();
  return {
    storeId: { in: f.storeIds },
    ...(f.status && { status: f.status }),
    ...(q && { OR: [{ supplierName: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }] }),
  };
}

/** A page of invoices, soonest due first (paid ones newest first), with their file and the people involved. */
export async function supplierInvoiceList(f: InvoiceFilters, page: number, pageSize: number) {
  const where = invoiceWhere(f);
  const [total, rows] = await Promise.all([
    db.supplierInvoice.count({ where }),
    db.supplierInvoice.findMany({ where, orderBy: f.status === "PAID" ? [{ paidAt: "desc" }] : [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const [uploads, users] = await Promise.all([
    db.upload.findMany({ where: { id: { in: rows.map((r) => r.uploadId).filter((x): x is string => !!x) } }, select: { id: true, contentType: true, sizeBytes: true } }),
    db.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.createdById, r.paidById]).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
  ]);
  const up = new Map(uploads.map((u) => [u.id, u]));
  const who = new Map(users.map((u) => [u.id, u.name]));
  return {
    total,
    rows: rows.map((r) => ({
      ...r,
      invoiceDay: asDay(r.invoiceDate),
      dueDay: asDay(r.dueDate),
      file: r.uploadId ? up.get(r.uploadId) ?? null : null,
      createdBy: who.get(r.createdById) ?? null,
      paidBy: r.paidById ? who.get(r.paidById) ?? null : null,
    })),
  };
}
export type SupplierInvoiceRow = Awaited<ReturnType<typeof supplierInvoiceList>>["rows"][number];

/** Due-soon / overdue / queried counts and rands for badges, as of today (SAST). */
export async function supplierInvoiceSummary(storeIds: string[], now = new Date(), soonDays = 7) {
  if (!storeIds.length) return { due: 0, dueCents: 0, overdue: 0, overdueCents: 0, dueSoon: 0, dueSoonCents: 0, queried: 0, queriedCents: 0, paid30: 0, paid30Cents: 0, onStatement: 0, onStatementCents: 0 };
  const today = dateCol(dayKey(now));
  const soon = dateCol(dayKey(addDays(now, soonDays)));
  const sum = (where: Prisma.SupplierInvoiceWhereInput) => db.supplierInvoice.aggregate({ where: { storeId: { in: storeIds }, ...where }, _count: true, _sum: { totalCents: true } });
  // Due includes this month's stock orders (on the statement); overdue and due-soon are what the store pays itself.
  const [due, overdue, dueSoon, queried, paid30, onStatement] = await Promise.all([
    sum({ status: "DUE" }),
    sum({ status: "DUE", onStatement: false, dueDate: { lt: today } }),
    sum({ status: "DUE", onStatement: false, dueDate: { gte: today, lte: soon } }),
    sum({ status: "QUERIED" }),
    sum({ status: "PAID", onStatement: false, paidAt: { gte: addDays(now, -30) } }),
    sum({ status: "DUE", onStatement: true }),
  ]);
  const c = (a: { _count: number; _sum: { totalCents: number | null } }) => [a._count, a._sum.totalCents ?? 0] as const;
  return {
    due: c(due)[0], dueCents: c(due)[1], overdue: c(overdue)[0], overdueCents: c(overdue)[1], dueSoon: c(dueSoon)[0], dueSoonCents: c(dueSoon)[1],
    queried: c(queried)[0], queriedCents: c(queried)[1], paid30: c(paid30)[0], paid30Cents: c(paid30)[1],
    onStatement: c(onStatement)[0], onStatementCents: c(onStatement)[1],
  };
}

/** Per-store due/overdue totals for HQ Finance (one grouped query, whatever the store count). */
export async function supplierInvoicesByStore(storeIds: string[], now = new Date()) {
  if (!storeIds.length) return [];
  const today = dateCol(dayKey(now));
  return db.$queryRaw<{ storeId: string; due: number; dueCents: number; overdue: number; overdueCents: number; queried: number; oldestDue: Date | null }[]>`
    SELECT "storeId",
      COUNT(*) FILTER (WHERE status = 'DUE')::int AS due,
      COALESCE(SUM("totalCents") FILTER (WHERE status = 'DUE'), 0)::int AS "dueCents",
      COUNT(*) FILTER (WHERE status = 'DUE' AND "dueDate" < ${today})::int AS overdue,
      COALESCE(SUM("totalCents") FILTER (WHERE status = 'DUE' AND "dueDate" < ${today}), 0)::int AS "overdueCents",
      COUNT(*) FILTER (WHERE status = 'QUERIED')::int AS queried,
      MIN("dueDate") FILTER (WHERE status = 'DUE') AS "oldestDue"
    FROM "SupplierInvoice" WHERE "storeId" = ANY(${storeIds}::text[]) AND status IN ('DUE', 'QUERIED') AND NOT "onStatement"
    GROUP BY 1`; // stock orders settle on the statements, so this is what stores owe outside suppliers
}

/** A stock order's invoice (shown on the order page). */
export const invoicesForOrder = (storeId: string, stockOrderId: string) =>
  db.supplierInvoice.findMany({ where: { storeId, stockOrderId }, orderBy: { createdAt: "desc" } });

// ── Stock orders: on the statement ──────────────────────────────────────────────

/**
 * A stock order received from an HQ distribution centre or another store, put on the buyer's supplier invoices (inside
 * the receive transaction): the stock order is the tax invoice (emailed to the owner), for what was received, due on the
 * last day of the month and settled on that month's franchise statement. Nothing when nothing was received, or when an
 * invoice for the order is already on file. Orders received before this was automatic: the 20261005130000 migration.
 */
export async function recordStatementInvoice(t: Tx, stockOrderId: string, actor: Actor, now = new Date()) {
  const o = await t.stockOrder.findUniqueOrThrow({ where: { id: stockOrderId }, include: { seller: { select: { name: true } }, lines: { select: { receivedQty: true, unitCostCents: true } } } });
  const ex = o.lines.reduce((sum, l) => sum + (l.receivedQty ?? 0) * l.unitCostCents, 0);
  if (ex <= 0 || (await t.supplierInvoice.count({ where: { stockOrderId: o.id } }))) return null;
  const day = dayKey(now);
  const terms = statementTerms(day);
  const vat = vatOnExcl(ex);
  const row = await t.supplierInvoice.create({
    data: {
      storeId: o.buyerId, supplierName: o.seller.name, number: o.number, invoiceDate: dateCol(day), dueDate: dateCol(terms.dueDay),
      totalCents: ex + vat, vatCents: vat, stockOrderId: o.id, onStatement: true, note: terms.settles, createdById: actor.id ?? "system",
    },
  });
  await audit(t, actor, "supplier_invoice.create", { storeId: o.buyerId, entity: "SupplierInvoice", entityId: row.id, data: { supplierName: o.seller.name, number: o.number, totalCents: ex + vat, vatCents: vat, stockOrderId: o.id, onStatement: true } });
  return row;
}

/** Daily: stock-order invoices from months that are over are settled — their franchise statement has been drawn up. */
export async function settleStatementInvoices(now = new Date()) {
  const monthStart = dateCol(`${dayKey(now).slice(0, 7)}-01`);
  const open = await db.supplierInvoice.findMany({ where: { onStatement: true, status: "DUE", invoiceDate: { lt: monthStart } }, select: { id: true, invoiceDate: true } });
  const byMonth = new Map<string, string[]>();
  for (const r of open) byMonth.set(asDay(r.invoiceDate).slice(0, 7), [...(byMonth.get(asDay(r.invoiceDate).slice(0, 7)) ?? []), r.id]);
  for (const [month, ids] of byMonth) {
    const terms = statementTerms(`${month}-01`);
    await db.supplierInvoice.updateMany({ where: { id: { in: ids }, status: "DUE" }, data: { status: "PAID", paidAt: new Date(`${terms.settledFrom}T00:00:00+02:00`), note: terms.settled } });
    await audit(db, SYSTEM, "supplier_invoice.settle_statement", { data: { month, invoices: ids.length } });
  }
  return { settled: open.length };
}
