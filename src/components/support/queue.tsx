// The support inbox, shared by HQ (the network, or an area manager's region) and a store's back office (tickets about
// its orders). Server-rendered; the URL is the state.
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { Chips } from "@/components/store/ui";
import { EmptyRow } from "@/components/hq/ui";
import { CategoryBadge, PriorityBadge, SlaBadge, TicketStatusBadge } from "./badges";
import { qs } from "@/server/hq/form";
import type { listTickets, ticketCounts, TicketView } from "@/server/support";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY, SUPPORT_PRIORITIES, SUPPORT_PRIORITY } from "@/lib/support";
import { fmtDate, num, timeAgo } from "@/lib/format";

type Rows = Awaited<ReturnType<typeof listTickets>>["rows"];
type Counts = Awaited<ReturnType<typeof ticketCounts>>;
export type QueueParams = { view?: string; category?: string; priority?: string; assignee?: string; q?: string; page?: string };

const VIEW_LABEL: Record<TicketView, string> = { open: "Open", mine: "Mine", unassigned: "Unassigned", overdue: "Overdue", waiting: "Waiting for member", resolved: "Resolved", all: "All" };

export function TicketQueue({ base, rows, total, page, pageSize, counts, view, sp, staff, orderHref, now }: {
  base: string;
  rows: Rows;
  total: number;
  page: number;
  pageSize: number;
  counts: Counts;
  view: TicketView;
  sp: QueueParams;
  staff: { id: string; name: string }[];
  /** Where an order code links to on this side of the house. */
  orderHref: (t: { orderCode: string | null; storeId: string | null }) => string | null;
  now: Date;
}) {
  const href = (p: Record<string, string | number | undefined>) => `${base}${qs({ ...sp, ...p })}`;
  const oldest = rows.filter((r) => r.status !== "RESOLVED").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open requests" value={num(counts.open)} sub={oldest ? `oldest ${timeAgo(oldest.createdAt, now)}` : "inbox clear"} />
        <Stat label="Unassigned" value={num(counts.unassigned)} sub="nobody's yet" />
        <Stat label="Overdue" value={num(counts.overdue)} sub="first reply in 1 business day, resolved in 5" />
        <Stat label="Waiting for member" value={num(counts.waiting)} sub="our reply is out" />
      </div>
      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4 sm:px-5">
          <FilterForm action={base} keep={{ view: sp.view }}>
            <SearchField defaultValue={sp.q} placeholder="Ticket number, subject, name, email or order code" />
            <FilterSelect name="category" label="Category" defaultValue={sp.category} options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY[c].label }))} />
            <FilterSelect name="priority" label="Priority" defaultValue={sp.priority} options={SUPPORT_PRIORITIES.map((p) => ({ value: p, label: SUPPORT_PRIORITY[p] }))} />
            <FilterSelect name="assignee" label="Assigned to" defaultValue={sp.assignee} options={[{ value: "none", label: "Nobody" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
          </FilterForm>
          <Chips
            label="View"
            current={view}
            items={(Object.keys(VIEW_LABEL) as TicketView[]).map((v) => ({ key: v, label: VIEW_LABEL[v], count: counts[v], href: href({ view: v === "open" ? undefined : v, page: undefined }), tone: v === "overdue" ? "red" : undefined }))}
          />
        </div>
        <Table className="relative">
          <thead>
            <tr>
              <Th>Ticket</Th>
              <Th>Subject</Th>
              <Th className="hidden md:table-cell">From</Th>
              <Th className="hidden lg:table-cell">Order</Th>
              <Th>Status</Th>
              <Th className="hidden sm:table-cell">SLA</Th>
              <Th className="hidden xl:table-cell">Assigned to</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <EmptyRow cols={7}>
                <LifeBuoy className="mx-auto mb-2 h-6 w-6 text-ink-300" strokeWidth={1.9} aria-hidden />
                {sp.q ? "No requests match that search." : view === "open" ? "Nothing open. The inbox is clear." : "No requests in this view."}
              </EmptyRow>
            )}
            {rows.map((t) => {
              const order = orderHref(t);
              return (
                <Tr key={t.id} className="align-top">
                  <Td className="whitespace-nowrap">
                    <Link href={`${base}/${t.id}`} className="font-mono text-xs font-semibold text-ink-900 hover:text-brand-700">
                      {t.number}
                    </Link>
                    <span className="block text-xs text-ink-500">{fmtDate(t.createdAt)}</span>
                    <span className="block text-xs text-ink-500">{timeAgo(t.createdAt, now)}</span>
                  </Td>
                  <Td className="min-w-56">
                    <Link href={`${base}/${t.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {t.subject}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <CategoryBadge category={t.category} />
                      {t.priority !== "NORMAL" && <PriorityBadge priority={t.priority} />}
                      <span className="text-xs text-ink-500">
                        {t._count.messages} message{t._count.messages === 1 ? "" : "s"}
                      </span>
                    </span>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="text-ink-850">{t.name}</span>
                    <span className="block text-xs text-ink-500 [overflow-wrap:anywhere]">{t.email ?? t.phone ?? "—"}</span>
                    {!t.customerId && <span className="block text-xs text-ink-400">Not a member</span>}
                  </Td>
                  <Td className="hidden lg:table-cell">{t.orderCode ? order ? <Link href={order} className="font-mono text-xs text-ink-800 hover:text-brand-700">{t.orderCode}</Link> : <span className="font-mono text-xs text-ink-500">{t.orderCode}</span> : <span className="text-ink-300">—</span>}</Td>
                  <Td className="whitespace-nowrap">
                    <TicketStatusBadge status={t.status} />
                  </Td>
                  <Td className="hidden whitespace-nowrap sm:table-cell">
                    <SlaBadge t={t} sla={t.sla} now={now} />
                  </Td>
                  <Td className="hidden whitespace-nowrap xl:table-cell">{t.assignee ? <span className="text-ink-800">{t.assignee}</span> : <span className="text-ink-400">Unassigned</span>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
