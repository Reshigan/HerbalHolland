// The returns queue, shared by HQ and a store's back office. Server-rendered; the URL is the state.
import Link from "next/link";
import { Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { Chips } from "@/components/store/ui";
import { EmptyRow } from "@/components/hq/ui";
import { ReasonBadge, ReturnStatusBadge } from "./badges";
import { qs } from "@/server/hq/form";
import type { listReturns, returnCounts, ReturnView } from "@/server/returns";
import { RETURN_REASON, RETURN_REASONS } from "@/lib/returns";
import { fmtDate, num, timeAgo } from "@/lib/format";
import { zar } from "@/lib/money";

type Rows = Awaited<ReturnType<typeof listReturns>>["rows"];
type Counts = Awaited<ReturnType<typeof returnCounts>>;
export type ReturnQueueParams = { view?: string; reason?: string; q?: string; page?: string };

const VIEW_LABEL: Record<ReturnView, string> = { open: "Open", requested: "To decide", approved: "Collection", received: "To refund", refunded: "Refunded", declined: "Declined", all: "All" };

export function ReturnQueue({ base, rows, total, page, pageSize, counts, view, sp, orderHref, now }: {
  base: string;
  rows: Rows;
  total: number;
  page: number;
  pageSize: number;
  counts: Counts;
  view: ReturnView;
  sp: ReturnQueueParams;
  orderHref: (o: { id: string; code: string }) => string;
  now: Date;
}) {
  const href = (p: Record<string, string | number | undefined>) => `${base}${qs({ ...sp, ...p })}`;
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting for a decision" value={num(counts.requested)} sub="reply within one business day" />
        <Stat label="Collection to book" value={num(counts.approved)} sub="booked by hand with the courier" />
        <Stat label="Received, to refund" value={num(counts.received)} sub="check it, then refund" />
        <Stat label="Refunded" value={num(counts.refunded)} sub={`${num(counts.declined)} declined`} />
      </div>
      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4 sm:px-5">
          <FilterForm action={base} keep={{ view: sp.view }}>
            <SearchField defaultValue={sp.q} placeholder="Return number, order code or waybill" />
            <FilterSelect name="reason" label="Reason" defaultValue={sp.reason} options={RETURN_REASONS.map((r) => ({ value: r, label: RETURN_REASON[r].label }))} />
          </FilterForm>
          <Chips label="View" current={view} items={(Object.keys(VIEW_LABEL) as ReturnView[]).map((v) => ({ key: v, label: VIEW_LABEL[v], count: counts[v], href: href({ view: v === "open" ? undefined : v, page: undefined }) }))} />
        </div>
        <Table className="relative">
          <thead>
            <tr>
              <Th>Return</Th>
              <Th>Order</Th>
              <Th className="hidden md:table-cell">Member</Th>
              <Th className="hidden sm:table-cell">Reason</Th>
              <Th align="right" className="hidden lg:table-cell">Units</Th>
              <Th>Status</Th>
              <Th align="right" className="hidden lg:table-cell">Refund</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <EmptyRow cols={7}>
                <Undo2 className="mx-auto mb-2 h-6 w-6 text-ink-300" strokeWidth={1.9} aria-hidden />
                {sp.q ? "No returns match that search." : view === "open" ? "Nothing open." : "No returns in this view."}
              </EmptyRow>
            )}
            {rows.map((r) => (
              <Tr key={r.id} className="align-top">
                <Td className="whitespace-nowrap">
                  <Link href={`${base}/${r.id}`} className="font-mono text-xs font-semibold text-ink-900 hover:text-brand-700">
                    {r.number}
                  </Link>
                  <span className="block text-xs text-ink-500">{fmtDate(r.createdAt)}</span>
                  <span className="block text-xs text-ink-500">{timeAgo(r.createdAt, now)}</span>
                </Td>
                <Td>
                  {r.order ? (
                    <>
                      <Link href={orderHref(r.order)} className="font-mono text-xs font-semibold text-ink-800 hover:text-brand-700">
                        {r.order.code}
                      </Link>
                      <span className="block text-xs text-ink-500">{r.order.store.name}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="hidden md:table-cell">
                  {r.customer ? (
                    <>
                      <span className="text-ink-850">
                        {r.customer.firstName} {r.customer.lastName ?? ""}
                      </span>
                      <span className="block font-mono text-xs text-ink-500">{r.customer.memberNo}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="hidden whitespace-nowrap sm:table-cell">
                  <ReasonBadge reason={r.reason} />
                  {r.photoUploadIds.length > 0 && <span className="block text-xs text-ink-500">{r.photoUploadIds.length} photo{r.photoUploadIds.length === 1 ? "" : "s"}</span>}
                </Td>
                <Td align="right" className="hidden lg:table-cell">{r.units}</Td>
                <Td className="whitespace-nowrap">
                  <ReturnStatusBadge status={r.status} />
                </Td>
                <Td align="right" className="hidden lg:table-cell">{r.refundCents != null ? zar(r.refundCents) : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
