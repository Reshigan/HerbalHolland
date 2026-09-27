import { History } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { qs, parseDay } from "@/server/hq/form";
import { addDays, fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { EmptyRow } from "@/components/hq/ui";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Audit log" };

type SP = { action?: string; store?: string; actor?: string; from?: string; to?: string; page?: string };

const GROUPS: { prefix: string; label: string; tone: Tone }[] = [
  { prefix: "compliance.", label: "Compliance", tone: "red" },
  { prefix: "batch.", label: "Batches & recalls", tone: "red" },
  { prefix: "customer.", label: "Members & POPIA", tone: "violet" },
  { prefix: "patient.", label: "Patient register", tone: "violet" },
  { prefix: "sale.", label: "Sales & refunds", tone: "green" },
  { prefix: "order.", label: "Online orders", tone: "green" },
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
  { prefix: "store.", label: "Stores", tone: "neutral" },
  { prefix: "company.", label: "Owner companies", tone: "neutral" },
  { prefix: "settings.", label: "Settings", tone: "neutral" },
  { prefix: "statement.", label: "Statements", tone: "neutral" },
  { prefix: "announcement.", label: "Announcements", tone: "neutral" },
  { prefix: "pos.", label: "Till sign-ins", tone: "dark" },
  { prefix: "shift.", label: "Shifts & cash-ups", tone: "dark" },
  { prefix: "device.", label: "Till devices", tone: "dark" },
  { prefix: "report.", label: "Report exports", tone: "neutral" },
  { prefix: "user.", label: "Users", tone: "dark" },
  { prefix: "auth.", label: "Sign-ins", tone: "dark" },
];
const toneOf = (action: string) => GROUPS.find((g) => action.startsWith(g.prefix))?.tone ?? "neutral";

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const page = pageParam(sp.page);
  const pageSize = 50;
  const from = parseDay(sp.from);
  const to = parseDay(sp.to);
  const action = sp.action?.trim();
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      scope.kind === "HQ" ? {} : { storeId: { in: ids } },
      action ? { action: { startsWith: action } } : {},
      sp.store ? { storeId: (await db.store.findFirst({ where: { code: sp.store, id: { in: ids } }, select: { id: true } }))?.id ?? "__none__" } : {},
      sp.actor?.trim() ? { actorName: { contains: sp.actor.trim(), mode: "insensitive" } } : {},
      from ? { at: { gte: from } } : {},
      to ? { at: { lt: addDays(to, 1) } } : {},
    ],
  };
  const [total, rows, stores] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s]));
  const href = (p: Record<string, string | number | undefined>) => `/hq/audit${qs({ ...sp, ...p })}`;

  return (
    <>
      <PageHeader
        overline="Governance"
        title="Audit log"
        description={scope.kind === "HQ" ? "Every sensitive action across the network — who did what, where and when. Entries can't be edited or deleted." : "Sensitive actions at the stores in your region. Entries can't be edited or deleted."}
      />
      <Card>
        <div className="border-b border-ink-100 p-4">
          <FilterForm action="/hq/audit">
            <SearchField name="actor" defaultValue={sp.actor} placeholder="Who (name)" label="Actor" />
            <FilterSelect name="action" label="Activity" defaultValue={action} allLabel="All" options={[...(action && !GROUPS.some((g) => g.prefix === action) ? [{ value: action, label: action }] : []), ...GROUPS.map((g) => ({ value: g.prefix, label: g.label }))]} />
            {stores.length > 1 && <FilterSelect name="store" label="Store" defaultValue={sp.store} options={stores.map((s) => ({ value: s.code, label: s.name }))} />}
            <label className="block">
              <span className="sr-only">From date</span>
              <input type="date" name="from" defaultValue={sp.from} aria-label="From date" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/15" />
            </label>
            <label className="block">
              <span className="sr-only">To date</span>
              <input type="date" name="to" defaultValue={sp.to} aria-label="To date" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/15" />
            </label>
          </FilterForm>
        </div>
        <Table className="relative">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Activity</Th>
              <Th>Who</Th>
              <Th className="hidden md:table-cell">Store</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <EmptyRow cols={5}>
                <History className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                No entries match these filters.
              </EmptyRow>
            )}
            {rows.map((r) => {
              const s = r.storeId ? storeName.get(r.storeId) : undefined;
              const data = r.data == null ? null : JSON.stringify(r.data, null, 2);
              return (
                <Tr key={r.id} className="align-top">
                  <Td className="whitespace-nowrap text-xs text-ink-600">{fmtDateTime(r.at)}</Td>
                  <Td>
                    <Badge tone={toneOf(r.action)}>{r.action}</Badge>
                    {r.entity && <span className="mt-1 block font-mono text-[0.68rem] text-ink-400">{r.entity}{r.entityId ? ` ${r.entityId.slice(0, 8)}…` : ""}</span>}
                  </Td>
                  <Td>
                    <span className="text-ink-850">{r.actorName ?? "—"}</span>
                    <span className="block text-xs text-ink-500">{r.actorType.toLowerCase()}</span>
                  </Td>
                  <Td className="hidden text-ink-600 md:table-cell">{s ? s.name : r.storeId ? "Other store" : "Network"}</Td>
                  <Td className="max-w-md">
                    {data ? (
                      <details className="group">
                        <summary className="cursor-pointer list-none truncate text-xs text-ink-600 marker:hidden hover:text-ink-900">
                          <span className="mr-1 inline-block text-oranje-700 transition group-open:rotate-90">▸</span>
                          {data.replace(/\s+/g, " ").slice(0, 90)}
                        </summary>
                        <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-ink-950 p-3 text-[0.7rem] leading-relaxed text-ink-100">{data}</pre>
                      </details>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
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
