// Stock on hand as CSV (valuation at cost), honouring the list's filters.
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { matchesSearch, sortStock, stockRows, STOCK_SORTS, type StockSort } from "@/server/store/inventory";
import { STOCK_STATUS, csvLine } from "@/server/store/rules";
import { actorOf } from "@/server/store/context";
import { REG_CLASS_LABEL } from "@/lib/compliance";
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
  const head = ["SKU", "Barcode", "Product", "Variant", "Category", "Class", "Ranged", "Status", "On hand", "Blocked", "Reserved", "Available", "Reorder point", "Par", "Sold 28d", "Days of cover", "Value at cost (R)"];
  const body = rows.map((r) =>
    csvLine([
      r.sku, r.barcode, r.productName, r.variantName, r.category, REG_CLASS_LABEL[r.regClass], r.ranged ? "yes" : "no", STOCK_STATUS[r.status].label,
      r.onHand, r.blocked, r.reserved, r.available, r.reorderPoint, r.parLevel, r.sold28,
      Number.isFinite(r.cover) ? r.cover.toFixed(1) : "", (r.valueCents / 100).toFixed(2),
    ]),
  );
  await audit(db, actorOf(user), "inventory.export", { storeId: store.id, data: { rows: rows.length } });
  return new Response([csvLine(head), ...body].join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="stock-on-hand-${store.code}-${dayKey(new Date())}.csv"`,
      "cache-control": "no-store",
    },
  });
}
