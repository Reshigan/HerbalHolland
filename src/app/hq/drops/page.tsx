import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { fmtDateTime, num } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Flash } from "@/components/hq/flash";
import { EmptyRow, Pill } from "@/components/hq/ui";
import { PHASE, dropPhase, dropStats, earlyLabel } from "./load";

export const metadata = { title: "Drops" };

const PAGE_SIZE = 20;
const TABS = [
  { key: "live", label: "Live now", empty: "Nothing is dropping right now." },
  { key: "upcoming", label: "Upcoming", empty: "No drops scheduled — plan the next one." },
  { key: "past", label: "Past", empty: "No drops have ended yet." },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function DropsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; m?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const now = new Date();
  const tab: Tab = sp.tab === "upcoming" || sp.tab === "past" ? sp.tab : "live";
  const page = pageParam(sp.page);

  // Live and upcoming drops are few by nature; past drops page in the database.
  const [current, pastTotal, past] = await Promise.all([
    db.drop.findMany({ where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, orderBy: { startsAt: "asc" }, take: 500 }),
    db.drop.count({ where: { endsAt: { lte: now } } }),
    tab === "past" ? db.drop.findMany({ where: { endsAt: { lte: now } }, orderBy: { endsAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }) : [],
  ]);
  const live = current.filter((d) => dropPhase(d, now) !== "upcoming");
  const upcoming = current.filter((d) => dropPhase(d, now) === "upcoming");
  const counts: Record<Tab, number> = { live: live.length, upcoming: upcoming.length, past: pastTotal };
  const rows = tab === "past" ? past : (tab === "live" ? live : upcoming).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const stats = await dropStats(rows, ids, now);
  const edit = can(user, "network");
  const href = (t: Tab, p?: number) => `/hq/drops${qs({ tab: t === "live" ? undefined : t, page: p && p > 1 ? p : undefined })}`;

  return (
    <>
      <PageHeader
        overline="Launch programme"
        title="Drops"
        description="Limited releases of apparel, accessories and CBD: members-only, tier early access and a per-member limit, enforced at every till and online. Watchers get an app push, else an SMS, inside legal send times."
        actions={
          edit && (
            <ButtonLink href="/hq/drops/new">
              <Plus className="h-4 w-4" /> New drop
            </ButtonLink>
          )
        }
      />
      <Flash message={sp.m} />
      {scope.kind !== "HQ" && <Notice className="mb-6">Units sold and stock cover the stores and distribution centre in your region.</Notice>}
      <TabLinks className="mb-4" current={href(tab)} tabs={TABS.map((t) => ({ label: t.label, count: counts[t.key], href: href(t.key) }))} />
      <Card>
        <Table stickyFirst className="relative">
          <thead>
            <tr>
              <Th>Drop</Th>
              <Th className="hidden md:table-cell">Opens</Th>
              <Th align="right" className="hidden sm:table-cell">Watchers</Th>
              <Th align="right">Sold</Th>
              <Th align="right" className="hidden sm:table-cell">Stock left</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <EmptyRow cols={6}>
                <Sparkles className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                {TABS.find((t) => t.key === tab)!.empty}
              </EmptyRow>
            )}
            {rows.map((d) => {
              const s = stats.get(d.id)!;
              const phase = dropPhase(d, now);
              const early = earlyLabel(d.earlyTier, d.earlyMinutes);
              return (
                <Tr key={d.id}>
                  <Td className="min-w-44 sm:min-w-56">
                    <Link href={`/hq/drops/${d.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {d.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-ink-500">/drops/{d.slug}</span>
                      <Pill>Limit {d.perMemberLimit}</Pill>
                      {d.membersOnly && <Pill>Members only</Pill>}
                    </span>
                  </Td>
                  <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">
                    {fmtDateTime(d.startsAt)}
                    <span className="block text-xs text-ink-500">
                      {[early, d.endsAt ? `ends ${fmtDateTime(d.endsAt)}` : "no end date"].filter(Boolean).join(" · ")}
                    </span>
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">{num(s.watchers)}</Td>
                  <Td align="right" className="font-medium text-ink-900">
                    {phase === "upcoming" ? <span className="font-normal text-ink-500">—</span> : num(s.sold)}
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    {num(s.inStores)}
                    <span className="block text-xs text-ink-500">{s.atDcs ? `+${num(s.atDcs)} at DCs` : "in stores"}</span>
                  </Td>
                  <Td>
                    <Badge tone={PHASE[phase][1]} dot>
                      {PHASE[phase][0]}
                    </Badge>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={counts[tab]} href={(p) => href(tab, p)} />
      </Card>
    </>
  );
}
