import Link from "next/link";
import { ArrowRight, ClipboardCheck, EyeOff, Plus } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { scopeLabels, stockTakeList } from "@/server/store/stock-takes";
import { hrefWith } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Qty } from "@/components/store/ui";

export const metadata = { title: "Stock takes" };
const PAGE_SIZE = 20;

export default async function StockTakesPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ page?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const page = pageParam(sp.page);
  const [{ total, rows }, { label }] = await Promise.all([stockTakeList(store.id, page, PAGE_SIZE), scopeLabels()]);
  const path = `/store/${store.code}/stock-takes`;
  const counting = rows.filter((r) => r.status === "COUNTING");

  return (
    <>
      <PageHeader
        overline={`Inventory · ${store.name}`}
        title="Stock takes"
        description="Full counts and category cycle counts. Blind counts hide system quantities from counters; approval posts the differences to the ledger."
        actions={
          canManage && (
            <ButtonLink href={`${path}/new`}>
              <Plus className="h-4 w-4" aria-hidden /> New stock take
            </ButtonLink>
          )
        }
      />

      {counting.length > 0 && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {counting.map((t) => (
            <Link key={t.id} href={`${path}/${t.id}`} className="group flex items-center gap-4 rounded-2xl bg-ink-950 p-4 text-white transition hover:bg-ink-900">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-oranje-500 text-ink-950">
                <ClipboardCheck className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-semibold">
                  {t.number} · {label(t.scope)}
                </span>
                <span className="mt-0.5 block text-xs text-ink-300">
                  Started {timeAgo(t.createdAt)}
                  {t.createdBy ? ` by ${t.createdBy}` : ""} · {t.stats.counted} of {t.stats.lines} lines counted
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink-800" role="meter" aria-valuenow={t.stats.counted} aria-valuemin={0} aria-valuemax={t.stats.lines} aria-label="Lines counted">
                  <span className="block h-full rounded-full bg-oranje-500" style={{ width: `${t.stats.lines ? (t.stats.counted / t.stats.lines) * 100 : 0}%` }} />
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-oranje-400">
                Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="No stock takes yet"
            action={canManage && <ButtonLink href={`${path}/new`} size="sm">Start the first count</ButtonLink>}
          >
            Cycle-count a category each week and do a full count every quarter to keep stock accurate.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Stock take</Th>
                <Th>Status</Th>
                <Th>Started</Th>
                <Th align="right">Lines counted</Th>
                <Th align="right">Variance units</Th>
                <Th align="right">Variance at cost</Th>
                <Th>Approved</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    <Link href={`${path}/${t.id}`} className="font-semibold text-ink-900 hover:text-oranje-700">
                      {t.number}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                      {label(t.scope)}
                      {t.blind && (
                        <Badge>
                          <EyeOff className="h-3 w-3" aria-hidden /> Blind
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">
                    {fmtDateTime(t.createdAt)}
                    {t.createdBy && <div className="text-xs text-ink-400">{t.createdBy}</div>}
                  </Td>
                  <Td align="right">
                    {t.stats.counted} / {t.stats.lines}
                  </Td>
                  <Td align="right">{t.status === "APPROVED" ? <Qty n={t.stats.netUnits} /> : <span className="text-ink-300">—</span>}</Td>
                  <Td align="right" className={t.status === "APPROVED" && t.stats.netValue < 0 ? "font-semibold text-rose-600" : "text-ink-800"}>
                    {t.status === "APPROVED" ? zar(t.stats.netValue) : <span className="text-ink-300">—</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">
                    {t.approvedAt ? fmtDate(t.approvedAt) : <span className="text-ink-300">—</span>}
                    {t.approvedBy && <div className="text-xs text-ink-400">{t.approvedBy}</div>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, {}, { page: p })} />
        </div>
      </Card>
    </>
  );
}
