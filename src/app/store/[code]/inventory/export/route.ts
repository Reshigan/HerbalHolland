// Stock on hand as CSV (valuation at cost), honouring the list's filters.
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { matchesSearch, sortStock, stockRows, STOCK_SORTS, type StockSort } from "@/server/store/inventory";
import { STOCK_STATUS } from "@/server/store/rules";
import { actorOf } from "@/server/store/context";
import { REG_CLASS_LABEL } from "@/lib/compliance";
import { csvFilename, toCsv } from "@/lib/csv";
import { dayKey } from "@/lib/format";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const u = new URL(req.url).searchParams;
  const q = u.get("q") ?? "", cat = u.get("cat") ?? "", cls = u.get("cls") ?? "", status = u.get("status") ?? "";
  const sort = (STOCK_SORTS as readonly string[]).includes(u.get("sort") ?? "") ? (u.get("sort") as StockSort) : "name";
  const rows = sortStock(
    (await stockRows(store.id)).filter(
      (r) =>
        matchesSearch(r, q) &&
        (!cat || r.categorySlug === cat) &&
        (!cls || r.regClass === cls) &&
        (!status || (status === "BLOCKED" ? r.blocked > 0 : r.status === status)),
    ),
    sort,
    u.get("dir") === "desc" ? "desc" : "asc",
  );
  const csv = toCsv({
    columns: [
      { key: "sku", label: "SKU" },
      { key: "barcode", label: "Barcode" },
      { key: "productName", label: "Product" },
      { key: "variantName", label: "Variant" },
      { key: "category", label: "Category" },
      { key: "cls", label: "Class" },
      { key: "ranged", label: "Ranged" },
      { key: "statusLabel", label: "Status" },
      { key: "onHand", label: "On hand", format: "number" },
      { key: "blocked", label: "Blocked", format: "number" },
      { key: "reserved", label: "Reserved", format: "number" },
      { key: "available", label: "Available", format: "number" },
      { key: "reorderPoint", label: "Reorder point", format: "number" },
      { key: "parLevel", label: "Par", format: "number" },
      { key: "sold28", label: "Sold 28 days", format: "number" },
      { key: "coverDays", label: "Days of cover", format: "number" },
      { key: "nextExpiry", label: "Next expiry", format: "date" },
      { key: "valueCents", label: "Value at cost (R)", format: "zar" },
    ],
    rows: rows.map((r) => ({
      ...r,
      cls: REG_CLASS_LABEL[r.regClass],
      statusLabel: STOCK_STATUS[r.status].label,
      coverDays: Number.isFinite(r.cover) ? r.cover : null,
    })),
    totals: { onHand: rows.reduce((s, r) => s + r.onHand, 0), valueCents: rows.reduce((s, r) => s + r.valueCents, 0) },
  });
  await audit(db, actorOf(user), "inventory.export", { storeId: store.id, data: { rows: rows.length } });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename("herbal-holland", "stock-on-hand", store.code, dayKey(new Date()))}"`,
      "cache-control": "no-store",
    },
  });
}
