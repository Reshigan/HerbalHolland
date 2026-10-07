import Link from "next/link";
import { History } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { qs, parseDay } from "@/server/hq/form";
import { addDays, fmtDateTime } from "@/lib/format";
import { describeAction, describeData } from "@/lib/audit-describe";
import { invoiceUrl } from "@/server/invoices";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, Th, Td, Tr, SortableTh, TableEmpty, sortParams } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { SavedViews } from "@/components/admin/saved-views";
import { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Audit log" };

type SP = { q?: string; action?: string; store?: string; actor?: string; from?: string; to?: string; sort?: string; dir?: string; page?: string };

const GROUPS: { prefix: string; label: string; tone: Tone }[] = [
  { prefix: "compliance.", label: "Compliance", tone: "red" },
  { prefix: "batch.", label: "Batches & recalls", tone: "red" },
  { prefix: "customer.", label: "Members & POPIA", tone: "violet" },
  { prefix: "patient.", label: "Patient register", tone: "violet" },
  { prefix: "sale.", label: "Sales & refunds", tone: "green" },
  { prefix: "order.", label: "Online orders", tone: "green" },
  { prefix: "trade.", label: "Trade accounts & orders", tone: "green" },
  { prefix: "stockorder.", label: "Stock orders", tone: "blue" },
  { prefix: "stocktake.", label: "Stock takes", tone: "blue" },
  { prefix: "stock.", label: "Stock adjustments", tone: "blue" },
  { prefix: "price", label: "Pricing", tone: "orange" },
  { prefix: "promotion.", label: "Promotions", tone: "orange" },
  { prefix: "product.", label: "Catalogue", tone: "orange" },
  { prefix: "variant.", label: "Variants", tone: "orange" },
  { prefix: "ranging.", label: "Ranging", tone: "orange" },
  { prefix: "campaign.", label: "Campaigns", tone: "amber" },
  { prefix: "marketing.", label: "Marketing lists", tone: "amber" },
  { prefix: "lead.", label: "Franchise leads", tone: "violet" },
  { prefix: "store.", label: "Stores", tone: "neutral" },
  { prefix: "company.", label: "Owner companies", tone: "neutral" },
  { prefix: "settings.", label: "Settings", tone: "neutral" },
  { prefix: "statement.", label: "Statements", tone: "neutral" },
  { prefix: "ledger.", label: "Books", tone: "neutral" },
  { prefix: "bank.", label: "Bank statements", tone: "neutral" },
  { prefix: "announcement.", label: "Announcements", tone: "neutral" },
  { prefix: "pos.", label: "Till sign-ins", tone: "dark" },
  { prefix: "shift.", label: "Shifts & cash-ups", tone: "dark" },
  { prefix: "device.", label: "Till devices", tone: "dark" },
  { prefix: "report.", label: "Report exports", tone: "neutral" },
  { prefix: "user.", label: "Users", tone: "dark" },
  { prefix: "auth.", label: "Sign-ins", tone: "dark" },
];
const toneOf = (action: string) => GROUPS.find((g) => action.startsWith(g.prefix))?.tone ?? "neutral";
const SORTS = ["at", "action", "actor"] as const;
const ORDER_BY: Record<(typeof SORTS)[number], (d: "asc" | "desc") => Prisma.AuditLogOrderByWithRelationInput[]> = {
  at: (d) => [{ at: d }],
  action: (d) => [{ action: d }, { at: "desc" }],
  actor: (d) => [{ actorName: { sort: d, nulls: "last" } }, { at: "desc" }],
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const page = pageParam(sp.page);
  const pageSize = 50;
  const { sort, dir } = sortParams(SORTS, sp.sort, sp.dir, "at", "desc");
  const from = parseDay(sp.from);
  const to = parseDay(sp.to);
  const action = sp.action?.trim();
  const q = sp.q?.trim().slice(0, 80) ?? "";
  // Free-text search (an order number, a member number, an amount…) reads the entry's id and data, so it's bounded by
  // date: the range picked, or the last 90 days. At most 2,000 matches, newest first.
  const searchFrom = from ?? addDays(new Date(), -90);
  const searchIds = q
    ? (
        await db.$queryRaw<{ id: string }[]>`
          SELECT id FROM "AuditLog"
          WHERE at >= ${searchFrom} ${to ? Prisma.sql`AND at < ${addDays(to, 1)}` : Prisma.empty}
            ${scope.kind === "HQ" ? Prisma.empty : Prisma.sql`AND "storeId" = ANY(${ids}::text[])`}
            AND ("entityId" = ${q} OR "actorName" ILIKE ${`%${q}%`} OR data::text ILIKE ${`%${q}%`})
          ORDER BY at DESC LIMIT 2000`
      ).map((r) => r.id)
    : null;
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      scope.kind === "HQ" ? {} : { storeId: { in: ids } },
      // The books' activity (journals, bank lines, VAT) is for the books' own users: HQ admins here, not the HQ team.
      ...(user.role === "HQ_ADMIN" ? [] : [{ NOT: { action: { startsWith: "ledger." } } }, { NOT: { action: { startsWith: "bank." } } }]),
      action ? { action: { startsWith: action } } : {},
      sp.store ? { storeId: (await db.store.findFirst({ where: { code: sp.store, id: { in: ids } }, select: { id: true } }))?.id ?? "__none__" } : {},
      sp.actor?.trim() ? { actorName: { contains: sp.actor.trim(), mode: "insensitive" } } : {},
      from ? { at: { gte: from } } : {},
      to ? { at: { lt: addDays(to, 1) } } : {},
      searchIds ? { id: { in: searchIds } } : {},
    ],
  };
  const [total, rows, stores] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: ORDER_BY[sort](dir), skip: (page - 1) * pageSize, take: pageSize }),
    db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s]));
  // Online orders open by their code: look up the codes for this page's entries only.
  const orderIds = rows.filter((r) => r.entity === "Order" && r.entityId).map((r) => r.entityId!);
  const orderCode = new Map((orderIds.length ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, code: true } }) : []).map((o) => [o.id, o.code]));
  // Link only records that still exist (deleted ones, such as e2e clean-ups and erasures, would open a 404): one look-up per kind on this page.
  const finders: Record<string, (ids: string[]) => Promise<{ id: string }[]>> = {
    TradeOrder: (i) => db.tradeOrder.findMany({ where: { id: { in: i } }, select: { id: true } }),
    TradeAccount: (i) => db.tradeAccount.findMany({ where: { id: { in: i } }, select: { id: true } }),
    Customer: (i) => db.customer.findMany({ where: { id: { in: i } }, select: { id: true } }),
    Batch: (i) => db.batch.findMany({ where: { id: { in: i } }, select: { id: true } }),
    Product: (i) => db.product.findMany({ where: { id: { in: i } }, select: { id: true } }),
    Campaign: (i) => db.campaign.findMany({ where: { id: { in: i } }, select: { id: true } }),
    Promotion: (i) => db.promotion.findMany({ where: { id: { in: i } }, select: { id: true } }),
    FranchiseLead: (i) => db.franchiseLead.findMany({ where: { id: { in: i } }, select: { id: true } }),
    SupportTicket: (i) => db.supportTicket.findMany({ where: { id: { in: i } }, select: { id: true } }),
    ReturnRequest: (i) => db.returnRequest.findMany({ where: { id: { in: i } }, select: { id: true } }),
    StockOrder: (i) => db.stockOrder.findMany({ where: { id: { in: i } }, select: { id: true } }),
    StoreEvent: (i) => db.storeEvent.findMany({ where: { id: { in: i } }, select: { id: true } }),
    Drop: (i) => db.drop.findMany({ where: { id: { in: i } }, select: { id: true } }),
  };
  const alive = new Set(
    (
      await Promise.all(
        Object.entries(finders).map(([kind, find]) => {
          const ids = [...new Set(rows.filter((r) => r.entity === kind && r.entityId).map((r) => r.entityId!))];
          return ids.length ? find(ids) : [];
        }),
      )
    ).flat().map((r) => r.id),
  );
  const entityHref = (entity: string | null, id: string | null): string | null => {
    if (!entity || !id) return null;
    if (entity in finders && !alive.has(id)) return null;
    switch (entity) {
      case "Sale":
        return invoiceUrl(id).replace(/^https?:\/\/[^/]+/, "");
      case "TradeOrder":
        return `/hq/trade/orders/${id}`;
      case "TradeAccount":
        return `/hq/trade/accounts/${id}`;
      case "Customer":
        return `/hq/customers/${id}`;
      case "Batch":
        return `/hq/batches/${id}`;
      case "Order":
        return orderCode.has(id) ? `/hq/orders/${orderCode.get(id)}` : null;
      case "Product":
        return `/hq/catalogue/${id}`;
      case "Campaign":
        return `/hq/marketing/${id}`;
      case "Promotion":
        return `/hq/promotions/${id}`;
      case "FranchiseLead":
        return `/hq/franchise/${id}`;
      case "SupportTicket":
        return `/hq/support/${id}`;
      case "ReturnRequest":
        return `/hq/returns/${id}`;
      case "StockOrder":
        return `/hq/distribution/${id}`;
      case "StoreEvent":
        return `/hq/events/${id}`;
      case "Drop":
        return `/hq/drops/${id}`;
      case "Store":
        return storeName.has(id) ? `/hq/stores/${storeName.get(id)!.code}` : null;
      default:
        return null;
    }
  };
  const href = (p: Record<string, string | number | undefined>) => `/hq/audit${qs({ ...sp, ...p })}`;
  const sortHref = (key: string, d: "asc" | "desc") => href({ sort: key, dir: d, page: undefined });

  return (
    <>
      <PageHeader
        overline="Governance"
        title="Audit log"
        description={scope.kind === "HQ" ? "Every sensitive action across the network: who did what, where and when. Entries can't be edited or deleted." : "Sensitive actions at the stores in your region. Entries can't be edited or deleted."}
      />
      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4">
          <FilterForm action="/hq/audit" keep={{ sort: sp.sort, dir: sp.dir }}>
            <SearchField defaultValue={sp.q} placeholder="Find: order or member no., name, amount, id…" label="Search the log" />
            <SearchField name="actor" defaultValue={sp.actor} placeholder="Who (name)" label="Actor" className="basis-40" />
            <FilterSelect name="action" label="Activity" defaultValue={action} allLabel="All" options={[...(action && !GROUPS.some((g) => g.prefix === action) ? [{ value: action, label: action }] : []), ...GROUPS.filter((g) => user.role === "HQ_ADMIN" || !["ledger.", "bank."].includes(g.prefix)).map((g) => ({ value: g.prefix, label: g.label }))]} />
            {stores.length > 1 && <FilterSelect name="store" label="Store" defaultValue={sp.store} options={stores.map((s) => ({ value: s.code, label: s.name }))} />}
            <label className="block">
              <span className="sr-only">From date</span>
              <input type="date" name="from" defaultValue={sp.from} aria-label="From date" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
            </label>
            <label className="block">
              <span className="sr-only">To date</span>
              <input type="date" name="to" defaultValue={sp.to} aria-label="To date" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
            </label>
          </FilterForm>
          <SavedViews pageKey="hq-audit" userKey={user.id} />
        </div>
        <Table className="relative" stickyFirst minWidth="56rem">
          <thead>
            <tr>
              <SortableTh label="When" sortKey="at" sort={sort} dir={dir} href={sortHref} title="Newest first" />
              <SortableTh label="Activity" sortKey="action" sort={sort} dir={dir} href={sortHref} />
              <SortableTh label="Who" sortKey="actor" sort={sort} dir={dir} href={sortHref} />
              <Th>Store</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <TableEmpty cols={5} icon={<History className="h-5 w-5" aria-hidden />} title="No entries match these filters">
                {q && !from ? "Search looks back 90 days. Pick an earlier From date to go further. " : ""}Widen the date range or clear the activity filter.
              </TableEmpty>
            )}
            {rows.map((r) => {
              const s = r.storeId ? storeName.get(r.storeId) : undefined;
              const data = r.data == null ? null : JSON.stringify(r.data, null, 2);
              const summary = describeData(r.data);
              const link = entityHref(r.entity, r.entityId);
              return (
                <Tr key={r.id} className="align-top">
                  <Td className="whitespace-nowrap text-xs text-ink-600">{fmtDateTime(r.at)}</Td>
                  <Td>
                    <span className="block font-medium text-ink-900" title={r.action}>{describeAction(r.action)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={toneOf(r.action)}>{GROUPS.find((g) => r.action.startsWith(g.prefix))?.label ?? r.action.split(".")[0]}</Badge>
                      {r.entity &&
                        (link ? (
                          <Link href={link} className="text-xs font-semibold text-brand-700 hover:underline" title={`${r.entity} ${r.entityId}`}>
                            Open {r.entity.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} →
                          </Link>
                        ) : (
                          <span className="font-mono text-[0.68rem] text-ink-500" title={r.entityId ?? undefined}>
                            {r.entity}
                          </span>
                        ))}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-ink-850">{r.actorName ?? "—"}</span>
                    <span className="block text-xs text-ink-500">{r.actorType.toLowerCase()}</span>
                  </Td>
                  <Td className="text-ink-600">{s ? s.name : r.storeId ? "Other store" : "Network"}</Td>
                  <Td className="max-w-md">
                    {data ? (
                      <details className="group">
                        <summary className="cursor-pointer list-none text-xs text-ink-700 marker:hidden hover:text-ink-900">
                          <span className="mr-1 inline-block text-brand-700 transition group-open:rotate-90">▸</span>
                          {summary || "Show the raw entry"}
                        </summary>
                        <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-ink-950 p-3 text-[0.7rem] leading-relaxed text-ink-100">{data}</pre>
                      </details>
                    ) : (
                      <span className="text-xs text-ink-500">—</span>
                    )}
                  </Td>
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
