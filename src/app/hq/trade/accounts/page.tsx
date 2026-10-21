import Link from "next/link";
import { Briefcase } from "lucide-react";
import { db, Prisma } from "@/server/db";
import { tradeAccountSearch } from "@/server/trade/accounts";
import { qs } from "@/server/hq/form";
import { tradeNumberQuery } from "@/lib/trade";
import { zar } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Th, Td, Tr, SortableTh, TableEmpty, sortParams } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, SearchField } from "@/components/hq/filter-form";
import { ViewOnly } from "@/components/hq/ui";
import { SavedViews } from "@/components/admin/saved-views";
import { TradeAccountBadge, kindLabel, termsLabel } from "@/components/admin/trade-ui";
import { cn } from "@/lib/cn";
import { accountWhere, tradeScope } from "../scope";
import type { TradeAccountStatus } from "@/generated/prisma/client";

export const metadata = { title: "Trade accounts" };

type SP = { status?: string; q?: string; sort?: string; dir?: string; page?: string };
const STATUSES: TradeAccountStatus[] = ["PENDING", "APPROVED", "ON_HOLD", "CLOSED"];
const TABS: { key: string; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "LICENCES", label: "Licences to check" },
  { key: "APPROVED", label: "Approved" },
  { key: "ON_HOLD", label: "On hold" },
  { key: "CLOSED", label: "Closed" },
];
// Accounts (not closed) with a licence document waiting for HQ's check.
const CHECKING: Prisma.TradeAccountWhereInput = { status: { not: "CLOSED" }, licences: { some: { status: "SUBMITTED" } } };
const SORTS = ["number", "name", "kind", "status", "terms", "limit", "balance", "created"] as const;
// The balance is a sum over the ledger, so the page of ids is sorted in SQL; everything else rides along.
const ORDER_BY: Record<(typeof SORTS)[number], Prisma.Sql> = {
  number: Prisma.sql`a.number`,
  name: Prisma.sql`lower(a.name)`,
  kind: Prisma.sql`a.kind`,
  status: Prisma.sql`a.status`,
  terms: Prisma.sql`a.terms`,
  limit: Prisma.sql`a."creditLimitCents"`,
  balance: Prisma.sql`COALESCE(l.balance, 0)`,
  created: Prisma.sql`a."createdAt"`,
};

export default async function TradeAccountsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = await tradeScope();
  const status = STATUSES.includes(sp.status as TradeAccountStatus) ? (sp.status as TradeAccountStatus) : "ALL";
  const checking = sp.status === "LICENCES";
  const tab = checking ? "LICENCES" : status;
  const q = sp.q?.trim().slice(0, 100) ?? "";
  const page = pageParam(sp.page);
  const pageSize = 25;
  const { sort, dir } = sortParams(SORTS, sp.sort, sp.dir, "created", "desc");
  const where: Prisma.TradeAccountWhereInput = { AND: [accountWhere(s), status === "ALL" ? {} : { status }, checking ? CHECKING : {}, tradeAccountSearch(q)] };

  // Scope and search as Prisma decides them (the service's search), the page's order from SQL.
  const number = q ? tradeNumberQuery(q, "TA") : null;
  const like = `%${q}%`;
  const conds: Prisma.Sql[] = [];
  if (status !== "ALL") conds.push(Prisma.sql`a.status = ${status}`);
  if (checking) conds.push(Prisma.sql`a.status <> 'CLOSED' AND EXISTS (SELECT 1 FROM "TradeLicence" t WHERE t."tradeAccountId" = a.id AND t.status = 'SUBMITTED')`);
  if (q) conds.push(Prisma.sql`(a.number LIKE ${like} OR a.name LIKE ${like} OR a."legalName" LIKE ${like} OR a."vatNumber" LIKE ${like} OR a.email LIKE ${like}${number ? Prisma.sql` OR a.number = ${number}` : Prisma.empty})`);
  // The scope's store ids as one JSON parameter (any length under D1's 100 bound values).
  const scopeIds = Prisma.sql`SELECT value FROM json_each(${JSON.stringify(s.ids)})`;
  if (!s.networkWide)
    conds.push(Prisma.sql`(a."dcId" IN (${scopeIds}) OR EXISTS (SELECT 1 FROM "TradeOrder" o WHERE o."tradeAccountId" = a.id AND o."storeId" IN (${scopeIds})) OR EXISTS (SELECT 1 FROM "Sale" x WHERE x."tradeAccountId" = a.id AND x."storeId" IN (${scopeIds})))`);
  const sqlWhere = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty;
  const [total, ids, counts, toCheck] = await Promise.all([
    db.tradeAccount.count({ where }),
    db.$queryRaw<{ id: string }[]>`
      SELECT a.id FROM "TradeAccount" a
      LEFT JOIN (SELECT "tradeAccountId", SUM(cents) AS balance FROM "TradeLedgerEntry" GROUP BY 1) l ON l."tradeAccountId" = a.id
      ${sqlWhere}
      ORDER BY ${ORDER_BY[sort]} ${dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`}, a."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    db.tradeAccount.groupBy({ by: ["status"], where: { AND: [accountWhere(s), tradeAccountSearch(q)] }, _count: true }),
    db.tradeAccount.count({ where: { AND: [accountWhere(s), CHECKING, tradeAccountSearch(q)] } }),
  ]);
  const rows = ids.length
    ? await db.tradeAccount.findMany({ where: { id: { in: ids.map((r) => r.id) } }, include: { _count: { select: { orders: true, buyers: true } } } })
    : [];
  const balances = rows.length ? await db.tradeLedgerEntry.groupBy({ by: ["tradeAccountId"], where: { tradeAccountId: { in: rows.map((r) => r.id) } }, _sum: { cents: true } }) : [];
  const balance = new Map(balances.map((b) => [b.tradeAccountId, b._sum.cents ?? 0]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const list = ids.map((r) => byId.get(r.id)!).filter(Boolean);
  const n = (k: string) => (k === "ALL" ? counts.reduce((t, c) => t + c._count, 0) : k === "LICENCES" ? toCheck : counts.find((c) => c.status === k)?._count ?? 0);
  const href = (p: Record<string, string | number | undefined>) => `/hq/trade/accounts${qs({ ...sp, ...p })}`;
  const sortHref = (key: string, d: "asc" | "desc") => href({ sort: key, dir: d, page: undefined });
  const current = href({ status: tab === "ALL" ? undefined : tab, page: undefined });

  return (
    <>
      <PageHeader overline="Trade" title="Trade accounts" description="Businesses approved to buy at trade prices: their terms, credit limits and what they owe. Applications from the portal wait here as pending." />
      {!s.canEdit && <ViewOnly className="mb-6">Accounts that buy from your region (view only).</ViewOnly>}
      <Card>
        <TabLinks className="px-4" current={current} tabs={TABS.map((t) => ({ href: href({ status: t.key === "ALL" ? undefined : t.key, page: undefined }), label: t.label, count: n(t.key) }))} />
        <div className="space-y-3 border-b border-ink-100 p-4">
          <FilterForm action="/hq/trade/accounts" keep={{ status: tab === "ALL" ? undefined : tab, sort: sp.sort, dir: sp.dir }}>
            <SearchField defaultValue={q} placeholder="Account number, name, VAT number or email" />
          </FilterForm>
          <SavedViews pageKey="hq-trade-accounts" userKey={s.user.id} />
        </div>
        <Table className="relative" stickyFirst minWidth="64rem">
          <thead>
            <tr>
              <SortableTh label="Account" sortKey="name" sort={sort} dir={dir} href={sortHref} />
              <SortableTh label="Number" sortKey="number" sort={sort} dir={dir} href={sortHref} />
              <SortableTh label="Type" sortKey="kind" sort={sort} dir={dir} href={sortHref} />
              <SortableTh label="Status" sortKey="status" sort={sort} dir={dir} href={sortHref} />
              <SortableTh label="Terms" sortKey="terms" sort={sort} dir={dir} href={sortHref} />
              <SortableTh label="Credit limit" sortKey="limit" sort={sort} dir={dir} href={sortHref} align="right" />
              <SortableTh label="Balance" sortKey="balance" sort={sort} dir={dir} href={sortHref} align="right" title="What the account owes (negative: in credit)" />
              <Th align="right">Orders</Th>
              <SortableTh label="Applied" sortKey="created" sort={sort} dir={dir} href={sortHref} align="right" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <TableEmpty cols={9} icon={<Briefcase className="h-5 w-5" aria-hidden />} title={q ? "No accounts match" : status === "PENDING" ? "No applications waiting" : checking ? "No licences to check" : "No trade accounts yet"}>
                {q ? "Try the account number, trading name, VAT number or billing email." : "Businesses apply on the trade portal; approved accounts order at ex-VAT prices."}
              </TableEmpty>
            )}
            {list.map((a) => {
              const b = balance.get(a.id) ?? 0;
              return (
                <Tr key={a.id} href={`/hq/trade/accounts/${a.id}`}>
                  <Td>
                    <Link href={`/hq/trade/accounts/${a.id}`} className="font-medium text-ink-900 hover:text-brand-700">{a.name}</Link>
                    <span className="block text-xs text-ink-500">{a.legalName}{a.vatNumber ? ` · VAT ${a.vatNumber}` : ""} · {a.city}</span>
                  </Td>
                  <Td className="font-mono text-[0.8rem] text-ink-700">{a.number}</Td>
                  <Td className="text-ink-600">{kindLabel(a.kind)}</Td>
                  <Td><TradeAccountBadge status={a.status} /></Td>
                  <Td className="text-ink-600">{termsLabel(a)}</Td>
                  <Td align="right">{a.terms === "ACCOUNT" ? zar(a.creditLimitCents) : <span className="text-ink-500">—</span>}</Td>
                  <Td align="right" className={cn("font-medium", b > 0 ? "text-ink-900" : b < 0 ? "text-leaf-700" : "text-ink-500")}>{zar(b)}</Td>
                  <Td align="right" className="text-ink-600">{a._count.orders}</Td>
                  <Td align="right" className="whitespace-nowrap text-ink-600">{fmtDate(a.createdAt)}</Td>
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
