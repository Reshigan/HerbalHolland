// Purchasing: stock bought from HQ distribution centres (wholesale) and other stores
// (network trading), and how accurately it arrived.
import { db, type Prisma } from "../db";
import { receivedValue } from "../stock-orders";
import { zar } from "@/lib/money";
import type { ReportDef, Row } from "./types";
import { bounds, multi, n, ratio, storeCols, storeVals, sumRows } from "./util";

const supplierLabel = (s: { name: string; kind: string }) => (s.kind === "WAREHOUSE" ? s.name : `${s.name} (network store)`);
const KIND_LABEL: Record<string, string> = { WHOLESALE: "Wholesale", NETWORK: "Network trade" };

function receivedWhere(ctx: Parameters<ReportDef["run"]>[0]): Prisma.StockOrderWhereInput {
  const { start, end } = bounds(ctx);
  return { buyerId: { in: ctx.storeIds }, status: "RECEIVED", receivedAt: { gte: start, lt: end } };
}

export const purchases: ReportDef = {
  key: "purchases",
  title: "Purchases",
  description: "What stock did we buy, from which distribution centre or store, and for how much?",
  group: "Purchasing",
  scopes: ["store", "hq"],
  filters: ["range"],
  params: [{ key: "by", label: "Show", options: [{ value: "supplier", label: "By supplier" }, { value: "order", label: "Order by order" }], default: "supplier" }],
  async run(ctx) {
    const [orders, open] = await Promise.all([
      db.stockOrder.findMany({
        where: receivedWhere(ctx),
        orderBy: { receivedAt: "desc" },
        include: { lines: { select: { qty: true, receivedQty: true, unitCostCents: true } }, seller: { select: { id: true, name: true, code: true, kind: true } } },
      }),
      db.stockOrder.aggregate({ where: { buyerId: { in: ctx.storeIds }, status: { in: ["SUBMITTED", "APPROVED", "SHIPPED"] } }, _count: true, _sum: { totalCents: true } }),
    ]);
    const shaped = orders.map((o) => {
      const ex = o.lines.reduce((s, l) => s + (l.receivedQty ?? 0) * l.unitCostCents, 0);
      const incl = receivedValue(o);
      return { o, ex, vat: incl - ex, incl, units: o.lines.reduce((s, l) => s + (l.receivedQty ?? 0), 0), ordered: o.lines.reduce((s, l) => s + l.qty, 0) };
    });
    const totalEx = shaped.reduce((s, x) => s + x.ex, 0), totalVat = shaped.reduce((s, x) => s + x.vat, 0);
    const summary = [
      { label: "Orders received", value: shaped.length, format: "number" as const },
      { label: "Purchases ex VAT", value: totalEx, format: "zar" as const },
      { label: "VAT on purchases", value: totalVat, format: "zar" as const, sub: "input tax" },
      { label: "Still open", value: open._count, format: "number" as const, sub: open._count ? `${zar(open._sum.totalCents ?? 0)} incl VAT on order` : "nothing awaiting delivery" },
    ];
    const bySupplier = new Map<string, { name: string; kind: string; orders: number; units: number; ex: number; vat: number; incl: number }>();
    for (const x of shaped) {
      const k = `${x.o.sellerId}|${x.o.kind}`;
      const s = bySupplier.get(k) ?? { name: supplierLabel(x.o.seller), kind: KIND_LABEL[x.o.kind], orders: 0, units: 0, ex: 0, vat: 0, incl: 0 };
      s.orders++; s.units += x.units; s.ex += x.ex; s.vat += x.vat; s.incl += x.incl;
      bySupplier.set(k, s);
    }
    const suppliers = [...bySupplier.values()].sort((a, b) => b.ex - a.ex);
    const chart = suppliers.length
      ? { kind: "bar" as const, title: "Purchases by supplier", description: "Received value ex VAT", format: "zar" as const, rows: suppliers.map((s) => ({ label: s.name, value: s.ex, sub: `${n(s.orders)} order${s.orders === 1 ? "" : "s"}` })) }
      : null;
    const note = "Value is what was actually received (received quantity × agreed unit cost), which is what the tax invoice and franchise statement charge. Open orders are submitted, approved or in transit.";
    if (ctx.params.by === "order") {
      const rows: Row[] = shaped.slice(0, ctx.rowLimit).map((x) => ({
        received: x.o.receivedAt, number: x.o.number, ...storeVals(ctx, x.o.buyerId), supplier: supplierLabel(x.o.seller), kind: KIND_LABEL[x.o.kind],
        lines: x.o.lines.length, ordered: x.ordered, units: x.units, ex: x.ex, vat: x.vat, incl: x.incl, invoiced: x.o.invoiceSentAt,
      }));
      return {
        columns: [
          { key: "received", label: "Received", format: "datetime" },
          { key: "number", label: "Order" },
          ...storeCols(ctx),
          { key: "supplier", label: "Supplier" },
          { key: "kind", label: "Type" },
          { key: "lines", label: "Lines", format: "number" },
          { key: "ordered", label: "Units ordered", format: "number" },
          { key: "units", label: "Units received", format: "number" },
          { key: "ex", label: "Value ex VAT", format: "zar" },
          { key: "vat", label: "VAT", format: "zar" },
          { key: "incl", label: "Total incl VAT", format: "zar" },
          { key: "invoiced", label: "Invoice emailed", format: "date" },
        ],
        rows,
        totalRows: shaped.length,
        totals: { received: "Total", ...sumRows(shaped.map((x) => ({ lines: x.o.lines.length, ordered: x.ordered, units: x.units, ex: x.ex, vat: x.vat, incl: x.incl })), ["lines", "ordered", "units", "ex", "vat", "incl"]) },
        summary,
        chart,
        empty: "No stock orders were received in this period.",
        note,
      };
    }
    const rows: Row[] = suppliers.map((s) => ({ ...s, avg: s.orders ? Math.round(s.ex / s.orders) : null }));
    return {
      columns: [
        { key: "name", label: "Supplier" },
        { key: "kind", label: "Type" },
        { key: "orders", label: "Orders", format: "number" },
        { key: "units", label: "Units received", format: "number" },
        { key: "ex", label: "Value ex VAT", format: "zar" },
        { key: "vat", label: "VAT", format: "zar" },
        { key: "incl", label: "Total incl VAT", format: "zar" },
        { key: "avg", label: "Avg order ex VAT", format: "zar" },
      ],
      rows,
      totals: sumRows(rows, ["orders", "units", "ex", "vat", "incl"], { name: "Total" }),
      summary,
      chart,
      empty: "No stock orders were received in this period.",
      note,
    };
  },
};

export const receiving: ReportDef = {
  key: "receiving",
  title: "Receiving discrepancies",
  description: "Did we receive what was ordered and shipped? Short shipments and losses in transit.",
  group: "Purchasing",
  scopes: ["store", "hq"],
  filters: ["range"],
  params: [{ key: "show", label: "Show", options: [{ value: "issues", label: "Discrepancies only" }, { value: "all", label: "All received lines" }], default: "issues" }],
  async run(ctx) {
    const orders = await db.stockOrder.findMany({
      where: receivedWhere(ctx),
      orderBy: { receivedAt: "desc" },
      include: {
        seller: { select: { name: true, kind: true } },
        lines: { include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } } } },
      },
    });
    let ordered = 0, shipped = 0, received = 0, lostValue = 0, lines = 0;
    const all: Row[] = [];
    for (const o of orders)
      for (const l of o.lines) {
        const s = ((l.shipped as { qty: number }[] | null) ?? []).reduce((a, b) => a + b.qty, 0);
        const r = l.receivedQty ?? 0;
        ordered += l.qty; shipped += s; received += r; lines++;
        lostValue += Math.max(0, s - r) * l.unitCostCents;
        const issue = l.qty !== s || s !== r;
        if (ctx.params.show !== "all" && !issue) continue;
        all.push({
          received: o.receivedAt, number: o.number, ...storeVals(ctx, o.buyerId), supplier: supplierLabel(o.seller), product: `${l.variant.product.name} · ${l.variant.name}`, sku: l.variant.sku,
          ordered: l.qty, shipped: s, got: r, short: l.qty - s, lost: s - r, value: Math.max(0, s - r) * l.unitCostCents,
          status: s - r > 0 ? "Lost in transit" : r > s ? "Over-received" : l.qty > s ? "Short-shipped" : "Complete",
        });
      }
    const rows = all.slice(0, ctx.rowLimit);
    return {
      columns: [
        { key: "received", label: "Received", format: "date" },
        { key: "number", label: "Order" },
        ...storeCols(ctx),
        { key: "supplier", label: "Supplier" },
        { key: "product", label: "Product" },
        { key: "sku", label: "SKU" },
        { key: "ordered", label: "Ordered", format: "number" },
        { key: "shipped", label: "Shipped", format: "number" },
        { key: "got", label: "Received", format: "number" },
        { key: "short", label: "Short-shipped", format: "number" },
        { key: "lost", label: "Missing on arrival", format: "number" },
        { key: "value", label: "Missing value ex VAT", format: "zar" },
        { key: "status", label: "Status", format: "badge", tones: { "Lost in transit": "red", "Short-shipped": "amber", "Over-received": "blue", Complete: "green" } },
      ],
      rows,
      totalRows: all.length,
      totals: { received: "Total", ...sumRows(all, ["ordered", "shipped", "got", "short", "lost", "value"]) },
      summary: [
        { label: "Orders received", value: orders.length, format: "number", sub: `${n(lines)} lines` },
        { label: "Fill rate", value: ratio(shipped, ordered), format: "pct", sub: "shipped ÷ ordered" },
        { label: "Receipt accuracy", value: ratio(received, shipped), format: "pct", sub: "received ÷ shipped" },
        { label: "Missing on arrival", value: lostValue, format: "zar", sub: `${n(shipped - received)} units`, upIsGood: false },
      ],
      empty: ctx.params.show === "all" ? "No stock orders were received in this period." : "Every line arrived as shipped — no discrepancies in this period.",
      note: `Short-shipped = ordered but not sent (the supplier didn't have it). Missing on arrival = shipped but not received — raise it with the supplier${multi(ctx) ? "s" : ""}; the buyer is only invoiced for what was received.`,
    };
  },
};
