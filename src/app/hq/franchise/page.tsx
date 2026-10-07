import Link from "next/link";
import { Download, Handshake } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { db } from "@/server/db";
import { LEAD_ROLES, leadSearch, leadView, viewWhere } from "@/server/leads";
import { qs } from "@/server/hq/form";
import { CAPITAL_LABEL, LEAD_STATUS, LEAD_STATUSES, OPEN_STATUSES, capitalLabel, type LeadStatusKey } from "@/lib/leads";
import { PROVINCES, displayPhone, type ProvinceCode } from "@/lib/sa";
import { addDays, fmtDate, num, timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { buttonClass } from "@/components/ui/button";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Chips, SearchForm } from "@/components/store/ui";
import { EmptyRow } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { LEAD_TONE, LeadStatusBadge } from "./ui";

export const metadata = { title: "Franchise leads" };

const PAGE_SIZE = 25;
type SP = { status?: string; q?: string; page?: string; m?: string };
const province = (p: string | null) => (p && Object.hasOwn(PROVINCES, p) ? PROVINCES[p as ProvinceCode] : null);

export default async function FranchiseLeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await requireStaff(LEAD_ROLES); // HQ admin and the HQ team; area managers don't see franchise enquiries
  const view = leadView(sp.status);
  const q = (sp.q ?? "").trim();
  const page = pageParam(sp.page);
  const search = leadSearch(q);
  const where = { AND: [viewWhere(view), search] };
  const now = new Date();

  const [byStatus, matching, total, leads, oldestNew, lastMonth] = await Promise.all([
    db.franchiseLead.groupBy({ by: ["status"], _count: true }),
    q ? db.franchiseLead.groupBy({ by: ["status"], where: search, _count: true }) : null,
    db.franchiseLead.count({ where }),
    db.franchiseLead.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.franchiseLead.findFirst({ where: { status: "NEW" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.franchiseLead.count({ where: { createdAt: { gte: addDays(now, -30) } } }),
  ]);
  const ownerIds = [...new Set(leads.flatMap((l) => (l.ownerId ? [l.ownerId] : [])))];
  const owners = new Map((ownerIds.length ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));

  const tally = (groups: { status: LeadStatusKey; _count: number }[]) => {
    const n = (s: LeadStatusKey) => groups.find((g) => g.status === s)?._count ?? 0;
    return { n, open: OPEN_STATUSES.reduce((t, s) => t + n(s), 0), all: groups.reduce((t, g) => t + g._count, 0) };
  };
  const network = tally(byStatus);
  const chips = tally(matching ?? byStatus); // with a search, the chips count the matches
  const href = (p: Record<string, string | number | undefined>) => `/hq/franchise${qs({ status: sp.status, q: q || undefined, ...p })}`;
  const statusHref = (s: string | undefined) => href({ status: s, page: undefined });
  const exportHref = `/hq/franchise/export${qs({ status: view === "open" ? undefined : view, q: q || undefined })}`;

  return (
    <>
      <PageHeader
        overline="Network"
        title="Franchise leads"
        description="Franchise enquiries received before the website's enquiry form closed, from first reply to signing. Their details are for HQ only; enquiries that aren't a fit are deleted a year after their last change."
        actions={
          <a href={exportHref} download className={buttonClass("outline")}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </a>
        }
      />
      <Flash message={sp.m} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="New, waiting for a reply" value={num(network.n("NEW"))} sub={oldestNew ? `oldest ${timeAgo(oldestNew.createdAt, now)}` : "all answered"} />
        <Stat label="Open leads" value={num(network.open)} sub={`${num(network.n("INFO_EVENING"))} at information evenings`} />
        <Stat label="Disclosure sent" value={num(network.n("DISCLOSURE_SENT"))} sub="signing 14+ days after it went out" />
        <Stat label="Enquiries, last 30 days" value={num(lastMonth)} sub={`${num(network.n("SIGNED"))} signed to date`} />
      </div>

      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4 sm:px-5">
          <SearchForm path="/hq/franchise" q={q} keep={{ status: sp.status }} placeholder="Number, name, email or area" />
          <Chips
            label="Status"
            current={view}
            items={[
              { key: "open", label: "Open", count: chips.open, href: statusHref(undefined) },
              ...LEAD_STATUSES.map((s) => ({ key: s, label: LEAD_STATUS[s].label, count: chips.n(s), tone: LEAD_TONE[s], href: statusHref(s) })),
              { key: "all", label: "All", count: chips.all, href: statusHref("all") },
            ]}
          />
        </div>
        <Table stickyFirst className="relative">
          <thead>
            <tr>
              <Th className="whitespace-nowrap">Number</Th>
              <Th className="hidden md:table-cell">Received</Th>
              <Th>Name</Th>
              <Th className="hidden sm:table-cell">Area</Th>
              <Th className="hidden lg:table-cell">{CAPITAL_LABEL}</Th>
              <Th className="hidden lg:table-cell">Pharmacist</Th>
              <Th className="hidden sm:table-cell">Status</Th>
              <Th className="hidden md:table-cell">Owner</Th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <EmptyRow cols={8}>
                <Handshake className="mx-auto mb-2 h-6 w-6 text-ink-300" strokeWidth={1.9} aria-hidden />
                {q
                  ? "No enquiries match that search."
                  : network.all === 0
                    ? "No franchise enquiries. herbalholland.com no longer takes them."
                    : view === "open"
                      ? "Nothing open: every enquiry is signed or closed."
                      : "No enquiries with this status."}
              </EmptyRow>
            )}
            {leads.map((l) => (
              <Tr key={l.id} className="align-top">
                <Td className="whitespace-nowrap">
                  <Link href={`/hq/franchise/${l.id}`} className="font-mono text-xs font-semibold text-ink-900 hover:text-brand-700">
                    {l.number}
                  </Link>
                  <span className="block text-xs text-ink-500 md:hidden">{fmtDate(l.createdAt)}</span>
                  <LeadStatusBadge status={l.status} className="mt-1.5 sm:hidden" />
                </Td>
                <Td className="hidden whitespace-nowrap md:table-cell">
                  <span className="text-ink-800">{fmtDate(l.createdAt)}</span>
                  <span className="block text-xs text-ink-500">{timeAgo(l.createdAt, now)}</span>
                </Td>
                <Td className="min-w-40 max-w-64 sm:min-w-48">
                  <Link href={`/hq/franchise/${l.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                    {l.name}
                  </Link>
                  <span className="block truncate text-xs text-ink-500" title={l.email}>{l.email}</span>
                  <span className="tnum block whitespace-nowrap text-xs text-ink-500">{displayPhone(l.phone)}</span>
                </Td>
                <Td className="hidden min-w-32 sm:table-cell">
                  <span className="text-ink-800">{l.area}</span>
                  {province(l.province) && <span className="block text-xs text-ink-500">{province(l.province)}</span>}
                </Td>
                <Td className="hidden whitespace-nowrap text-ink-800 lg:table-cell">{capitalLabel(l.capital)}</Td>
                <Td className="hidden text-ink-800 lg:table-cell">{l.pharmacist ? "Yes" : "No"}</Td>
                <Td className="hidden whitespace-nowrap sm:table-cell">
                  <LeadStatusBadge status={l.status} />
                </Td>
                <Td className="hidden whitespace-nowrap md:table-cell">{l.ownerId ? <span className="text-ink-800">{owners.get(l.ownerId) ?? "Former staff member"}</span> : <span className="text-ink-500">Unassigned</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
