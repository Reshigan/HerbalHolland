// Commission for payroll as CSV: the frozen lines once a month is approved, otherwise the live figures.
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { monthCommission, thisMonth, type CommissionLine } from "@/server/commission";
import { actorOf } from "@/server/store/context";
import { csvFilename, toCsv } from "@/lib/csv";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const raw = new URL(req.url).searchParams.get("month") ?? "";
  const month = MONTH.test(raw) && raw <= thisMonth() ? raw : thisMonth();
  const run = await db.commissionRun.findUnique({ where: { storeId_month: { storeId: store.id, month } } });
  if (!run && !store.commissionOn) return new Response("Commission isn't switched on for this store.", { status: 404, headers: { "cache-control": "no-store" } });
  const onlyMe = user.role === "BUDTENDER" ? user.id : undefined; // pay is personal: budtenders get their own line only
  const all = run ? (run.lines as CommissionLine[]) : await monthCommission(store.id, month, onlyMe);
  const lines = onlyMe ? all.filter((l) => l.userId === onlyMe) : all;
  const csv = toCsv({
    columns: [
      { key: "name", label: "Name" },
      { key: "salesCents", label: "Commissionable sales ex VAT", format: "zar" },
      { key: "refundsCents", label: "Refunds clawed back", format: "zar" },
      { key: "commissionCents", label: "Commission", format: "zar" },
      { key: "held", label: "Held" },
    ],
    rows: lines,
  });
  await audit(db, actorOf(user), "commission.export", { storeId: store.id, data: { month, rows: lines.length, approved: !!run } });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(`commission-${store.code}-${month}`)}"`,
      "cache-control": "no-store",
    },
  });
}
