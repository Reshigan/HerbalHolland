// CSV export: re-runs the same report definition with the same auth and scope checks
// as the page, then streams every row (not just the 500 on screen). Every export is audited.
//   /api/reports/sales-overview?store=PTA01&range=30d           (store back office)
//   /api/reports/sales-by-store?scope=hq&stores=region:GPN      (HQ console)
import type { NextRequest } from "next/server";
import { HQ_ROLES, requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { canRun, getReport } from "@/server/reports";
import { reportContext } from "@/server/reports/context";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { csvFilename, toCsv } from "@/lib/csv";
import { dayKey } from "@/lib/format";

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = getReport(key);
  if (!def) return new Response("Unknown report", { status: 404 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const hq = sp.scope === "hq";
  const user = await requireStaff(hq ? HQ_ROLES : undefined);
  if (!def.scopes.includes(hq ? "hq" : "store")) return new Response("This report isn't available here", { status: 404 });
  if (!canRun(def, user.role)) return new Response("You don't have access to this report", { status: 403 });
  if (!hq && !sp.store) return new Response("Missing ?store=<code>", { status: 400 });
  const store = hq ? undefined : await storeForUser(user, sp.store);

  const r = await reportContext({ def, scope: hq ? "hq" : "store", user, store, sp, mode: "csv", basePath: hq ? "/hq/reports" : `/store/${store!.code}/reports` });
  const result = await def.run(r.ctx);
  const csv = toCsv([
    { columns: result.columns, rows: result.rows, totals: result.totals },
    ...(result.extra ?? []).map((t) => ({ title: t.title, columns: t.columns, rows: t.rows, totals: t.totals })),
  ]);

  const where = hq ? (r.query.stores ? r.query.stores.replace("region:", "") : "network") : `${store!.code}${r.query.stores === "company" ? "-group" : ""}`;
  const period = r.controls.range ? [r.ctx.range.from, r.ctx.range.to] : [r.ctx.params.month ?? dayKey(r.ctx.now)];
  const filename = csvFilename("herbal-holland", def.key, where, ...period);

  await audit(db, { type: "USER", id: user.id, name: user.name }, "report.export", {
    storeId: store?.id ?? null,
    entity: "Report",
    entityId: def.key,
    data: { scope: hq ? "hq" : "store", query: r.query, rows: result.rows.length, personal: !!def.personal },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
