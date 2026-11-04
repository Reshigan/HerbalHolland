import { db } from "@/server/db";
import { insightsContext } from "@/server/insights";
import { CHANNEL_LABEL, CHANNELS } from "@/server/finance";
import { resolveRange } from "@/lib/ranges";
import { fmtDateTime } from "@/lib/format";
import { zar } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { InsightsShell, Row, insightHref, memberName, type InsightParams } from "@/components/insights/ui";

const PATH = "/insights/sales/list";
const SIZE = 25;

export default async function SalesList({ searchParams }: { searchParams: Promise<InsightParams & { channel?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await insightsContext(sp, PATH);
  const r = resolveRange(sp, "30d");
  const channel = CHANNELS.find((c) => c.channel === sp.channel)?.channel;
  const page = pageParam(sp.page);
  const where = { storeId: { in: ctx.storeIds }, createdAt: { gte: r.start, lt: r.end }, ...(channel && { channel }) };
  const [sales, total] = await Promise.all([
    db.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * SIZE,
      take: SIZE,
      select: { id: true, number: true, kind: true, channel: true, totalCents: true, createdAt: true, store: { select: { name: true } }, customer: { select: { firstName: true, lastName: true, memberNo: true } } },
    }),
    db.sale.count({ where }),
  ]);
  const keep = { channel };
  return (
    <InsightsShell tab="sales" path={PATH} ctx={ctx} sp={sp} r={r} keep={keep} title={channel ? `${CHANNEL_LABEL[channel]} sales` : "All sales"} back={{ href: insightHref("/insights/sales", sp), label: "Sales" }}>
      <Card>
        {sales.length ? (
          <ul>
            {sales.map((s) => (
              <Row key={s.id} href={insightHref(`/insights/sales/${s.id}`, sp)} title={s.customer ? memberName(s.customer) : "Walk-in"} sub={`${s.kind === "SALE" ? "" : "Refund · "}${s.store.name} · ${fmtDateTime(s.createdAt)}`} value={zar(s.totalCents)} valueSub={s.number} />
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-ink-500">No sales in this period.</p>
        )}
      </Card>
      <Pagination page={page} pageSize={SIZE} total={total} href={(p) => insightHref(PATH, sp, { ...keep, page: p })} />
    </InsightsShell>
  );
}
