import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { insightsContext } from "@/server/insights";
import { SEGMENTS, segmentOf } from "@/lib/rfm";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { zar } from "@/lib/money";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { TierBadge } from "@/components/ui/status";
import { InsightsShell, Row, insightHref, memberName, type InsightParams } from "@/components/insights/ui";

// Deliberately thin: spend and habits for the owner, no phone, email or ID number.
export default async function MemberDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<InsightParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const path = `/insights/members/${id}`;
  const ctx = await insightsContext(sp, path);
  const c = await db.customer.findUnique({ where: { id }, include: { homeStore: { select: { name: true } } } });
  if (!c || (!ctx.seesAllMembers && (!c.homeStoreId || !ctx.allIds.includes(c.homeStoreId)))) notFound();
  const sales = await db.sale.findMany({ where: { customerId: id, storeId: { in: ctx.allIds } }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, number: true, kind: true, totalCents: true, createdAt: true, store: { select: { name: true } } } });
  const name = c.phone.startsWith("anon-") ? "Anonymised member" : memberName(c);
  return (
    <InsightsShell tab="members" path={path} ctx={{ ...ctx, store: undefined }} sp={sp} title={name} back={{ href: insightHref("/insights/members/list", { store: sp.store }), label: "All members" }}>
      <p className="-mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-500">
        <TierBadge tier={c.tier} /> {SEGMENTS[segmentOf(c)].name} · {c.memberNo} · {c.homeStore?.name ?? "No home store"}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Lifetime spend" value={zar(c.lifetimeCents)} />
        <Stat label="Visits" value={c.visits.toLocaleString("en-ZA")} />
        <Stat label="Points" value={c.points.toLocaleString("en-ZA")} />
        <Stat label="Last bought" value={c.lastPurchaseAt ? fmtDate(c.lastPurchaseAt) : "Never"} sub={`Joined ${fmtDate(c.createdAt)}`} />
      </div>
      <Card>
        <CardHeader title="Recent purchases" className="pb-4" />
        {sales.length ? (
          <ul className="border-t border-ink-150">
            {sales.map((s) => (
              <Row key={s.id} href={insightHref(`/insights/sales/${s.id}`, sp)} title={s.store.name} sub={`${s.kind === "SALE" ? "" : "Refund · "}${fmtDateTime(s.createdAt)}`} value={zar(s.totalCents)} valueSub={s.number} />
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-sm text-ink-500">No purchases at your stores yet.</p>
        )}
      </Card>
    </InsightsShell>
  );
}
