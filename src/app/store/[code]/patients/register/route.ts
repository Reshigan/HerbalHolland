// Schedule 6 dispensing register as CSV for the responsible pharmacist / inspectors.
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { dispensingRegister } from "@/server/store/patients";
import { actorOf } from "@/server/store/context";
import { csvFilename, toCsv } from "@/lib/csv";
import { dayKey, rangeFromParams } from "@/lib/format";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const u = new URL(req.url).searchParams;
  const today = dayKey(new Date());
  const r = rangeFromParams({ from: u.get("from") || `${today.slice(0, 7)}-01`, to: u.get("to") || today });
  const { rows } = await dispensingRegister(store.id, r);
  const csv = toCsv({
    columns: [
      { key: "at", label: "Date", format: "datetime" },
      { key: "saleNumber", label: "Sale" },
      { key: "type", label: "Type" },
      { key: "patient", label: "Patient" },
      { key: "memberNo", label: "Member no." },
      { key: "authNumber", label: "Authorisation" },
      { key: "prescriber", label: "Prescriber (HPCSA)" },
      { key: "product", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "batches", label: "Batches" },
      { key: "qty", label: "Qty", format: "number" },
      { key: "grams", label: "Grams", format: "number" },
      { key: "dispenser", label: "Dispenser" },
      { key: "dispenserAuthorised", label: "Authorised dispenser" },
    ],
    rows: rows.map((x) => ({ ...x, type: x.refund ? "Return" : "Dispensed" })),
    totals: { qty: rows.reduce((s, x) => s + x.qty, 0), grams: rows.reduce((s, x) => s + x.grams, 0) },
  });
  await audit(db, actorOf(user), "patients.register_export", { storeId: store.id, data: { from: r.from, to: r.to, rows: rows.length } });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename("herbal-holland", "dispensing-register", store.code, r.from, r.to)}"`,
      "cache-control": "no-store",
    },
  });
}
