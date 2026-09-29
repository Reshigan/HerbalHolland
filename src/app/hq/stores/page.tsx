import Link from "next/link";
import { Plus, Store as StoreIcon } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { storeTable, storeSortDir, FORMATS, STATUSES, titleCase } from "@/server/hq/stores";
import { checklistProgressByStore } from "@/server/store-tasks";
import { ChecklistLine } from "@/components/hq/checklist";
import { qs } from "@/server/hq/form";
import { zar, zarCompact } from "@/lib/money";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, Tr, SortableTh, TableEmpty } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { DeltaText } from "@/components/hq/ui";
import { SavedViews } from "@/components/admin/saved-views";

export const metadata = { title: "Stores" };

type SP = { q?: string; region?: string; format?: string; status?: string; kind?: string; sort?: string; dir?: string; page?: string };

export default async function StoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const page = pageParam(sp.page);
  const pageSize = 25;
  const [t, regions] = await Promise.all([
    storeTable(ids, sp, page, pageSize),
    db.region.findMany({ where: scope.kind === "REGION" ? { id: scope.regionId } : {}, orderBy: { name: "asc" } }),
  ]);
  const progress = await checklistProgressByStore(t.rows.map((s) => s.id));
  const dcs = sp.kind === "WAREHOUSE";
  const href = (p: Record<string, string | number | undefined>) => `/hq/stores${qs({ ...sp, ...p })}`;
  const sort = sp.sort ?? "sales";
  const dir = storeSortDir(sort, sp.dir);
  const sortHref = (key: string, d: "asc" | "desc") => href({ sort: key, dir: d, page: undefined });

  return (
    <>
      <PageHeader
        overline={scope.kind === "REGION" ? `Region · ${user.region?.name}` : "Network"}
        title="Stores"
        description="Every store in the network with its owner, trading over the last 30 days and membership."
        actions={
          can(user, "admin") && (
            <ButtonLink href="/hq/stores/new">
              <Plus className="h-4 w-4" /> Onboard a store
            </ButtonLink>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={dcs ? "Distribution centres" : "Trading stores"} value={num(t.trading)} sub={t.opening ? `${t.opening} opening soon` : undefined} />
        <Stat label="Net sales · 30 days" value={zarCompact(t.totals.net)} sub="ex VAT, matching stores" />
        <Stat label="Transactions · 30 days" value={num(t.totals.tx)} />
        <Stat label="Average per trading store" value={zarCompact(t.trading ? t.totals.net / t.trading : 0)} sub="net sales, 30 days" />
      </div>

      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4">
          <FilterForm action="/hq/stores" keep={{ sort: sp.sort, dir: sp.dir }}>
            <SearchField defaultValue={sp.q} placeholder="Search store, code, city or owner" />
            {regions.length > 1 && <FilterSelect name="region" label="Region" defaultValue={sp.region} options={regions.map((r) => ({ value: r.code, label: r.name }))} />}
            <FilterSelect name="format" label="Format" defaultValue={sp.format} options={FORMATS.map((f) => ({ value: f, label: titleCase(f) }))} />
            <FilterSelect name="status" label="Status" defaultValue={sp.status} options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
            <FilterSelect name="kind" label="Type" defaultValue={sp.kind} allLabel={null} options={[{ value: "", label: "Retail stores" }, { value: "WAREHOUSE", label: "Distribution centres" }]} />
          </FilterForm>
          <SavedViews pageKey="hq-stores" userKey={user.id} />
        </div>
        <Table className="relative" stickyFirst minWidth="60rem">
          <thead>
            <tr>
              <SortableTh label="Store" sortKey="name" sort={sort} dir={dir} href={sortHref} />
              <Th>Region</Th>
              <Th>Owner</Th>
              <Th>Status</Th>
              <SortableTh label="Net 30d" sortKey="sales" sort={sort} dir={dir} href={sortHref} align="right" className="whitespace-nowrap" title="Net sales, last 30 days" />
              <SortableTh label="Growth" sortKey="growth" sort={sort} dir={dir} href={sortHref} align="right" className="whitespace-nowrap" />
              <SortableTh label="ATV" sortKey="atv" sort={sort} dir={dir} href={sortHref} align="right" title="Average transaction value" />
              <Th align="right">Members</Th>
            </tr>
          </thead>
          <tbody>
            {t.rows.length === 0 && (
              <TableEmpty cols={8} icon={<StoreIcon className="h-5 w-5" aria-hidden />} title="No stores match these filters">
                Try another region, format or status.
              </TableEmpty>
            )}
            {t.rows.map((s) => (
              <Tr key={s.id} href={`/hq/stores/${s.code}`}>
                <Td>
                  <Link href={`/hq/stores/${s.code}`} className="group block min-w-40">
                    <span className="font-medium text-ink-900 group-hover:text-brand-700">{s.name}</span>
                    <span className="block whitespace-nowrap text-xs text-ink-500">
                      <span className="font-mono">{s.code}</span> · {s.city}
                    </span>
                  </Link>
                </Td>
                <Td>
                  <span className="block whitespace-nowrap text-ink-700">{s.region.name}</span>
                  <span className="text-xs text-ink-500">{titleCase(s.format)}</span>
                </Td>
                <Td>
                  <span className="text-ink-800">{s.company.name}</span>
                  {!s.company.vatNumber && (
                    <Badge tone="amber" className="ml-2">
                      Non-VAT
                    </Badge>
                  )}
                </Td>
                <Td>
                  <StatusBadge status={s.status} />
                  <ChecklistLine progress={progress.get(s.id)} />
                </Td>
                <Td align="right" className="font-medium text-ink-900">{s.netCents ? zarCompact(s.netCents) : "—"}</Td>
                <Td align="right">
                  <DeltaText value={s.growth} />
                </Td>
                <Td align="right">{s.atvCents ? zar(s.atvCents) : "—"}</Td>
                <Td align="right">{num(s.members)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={t.total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
