import Link from "next/link";
import { X } from "lucide-react";
import { db } from "@/server/db";
import { insightsContext } from "@/server/insights";
import { memberWhere } from "@/server/hq/crm";
import { SEGMENTS, type SegmentKey } from "@/lib/rfm";
import { TIERS } from "@/lib/loyalty-rules";
import { fmtDate } from "@/lib/format";
import { zar } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { TierBadge } from "@/components/ui/status";
import { InsightsShell, Row, insightHref, memberName, type InsightParams } from "@/components/insights/ui";

const PATH = "/insights/members/list";
const SIZE = 25;

export default async function MemberList({ searchParams }: { searchParams: Promise<InsightParams & { q?: string; tier?: string; segment?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await insightsContext(sp, PATH);
  const tier = TIERS.find((t) => t.key === sp.tier);
  const segment = sp.segment && Object.hasOwn(SEGMENTS, sp.segment) ? SEGMENTS[sp.segment as SegmentKey] : undefined;
  const q = sp.q?.trim() || undefined;
  const page = pageParam(sp.page);
  const where = memberWhere(ctx.members, { q, tier: tier?.key, segment: segment && sp.segment });
  const [members, total] = await Promise.all([
    db.customer.findMany({ where, orderBy: [{ lifetimeCents: "desc" }, { memberNo: "asc" }], skip: (page - 1) * SIZE, take: SIZE, select: { id: true, firstName: true, lastName: true, memberNo: true, tier: true, lifetimeCents: true, visits: true, lastPurchaseAt: true } }),
    db.customer.count({ where }),
  ]);
  const base = { store: sp.store };
  const keep = { q, tier: tier?.key, segment: segment && sp.segment };
  const clear = (key: "tier" | "segment") => insightHref(PATH, base, { ...keep, [key]: undefined });
  const chip = (label: string, href: string) => (
    <Link href={href} className="inline-flex h-8 items-center gap-1 rounded-full border border-ink-150 bg-white pr-2 pl-3 text-xs font-semibold text-ink-700">
      {label} <X className="h-3.5 w-3.5" aria-label="Remove filter" />
    </Link>
  );
  return (
    <InsightsShell tab="members" path={PATH} ctx={ctx} sp={base} title={segment?.name ?? (tier ? `${tier.name} tier` : "All members")} back={{ href: insightHref("/insights/members", base), label: "Members" }}>
      <form action={PATH} className="flex gap-2">
        {sp.store && <input type="hidden" name="store" value={sp.store} />}
        {tier && <input type="hidden" name="tier" value={tier.key} />}
        {segment && <input type="hidden" name="segment" value={sp.segment} />}
        <input type="search" name="q" defaultValue={q} placeholder="Name, phone or member number" aria-label="Search members" className="h-11 min-w-0 flex-1 rounded-xl border border-ink-150 bg-white px-4 text-base text-ink-850 placeholder:text-ink-400 sm:text-sm" />
      </form>
      {(tier || segment) && (
        <div className="flex flex-wrap gap-2">
          {tier && chip(tier.name, clear("tier"))}
          {segment && chip(segment.name, clear("segment"))}
        </div>
      )}
      <Card>
        {members.length ? (
          <ul>
            {members.map((c) => (
              <Row key={c.id} href={insightHref(`/insights/members/${c.id}`, base)} title={memberName(c)} sub={<span className="inline-flex items-center gap-2"><TierBadge tier={c.tier} />{c.lastPurchaseAt ? `Bought ${fmtDate(c.lastPurchaseAt)}` : "No purchase yet"}</span>} value={zar(c.lifetimeCents)} valueSub={`${c.visits.toLocaleString("en-ZA")} visits`} />
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-ink-500">No members match.</p>
        )}
      </Card>
      <Pagination page={page} pageSize={SIZE} total={total} href={(p) => insightHref(PATH, base, { ...keep, page: p })} />
    </InsightsShell>
  );
}
