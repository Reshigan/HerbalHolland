import Link from "next/link";
import { ClipboardCheck, Download, PackageSearch, Scale, Truck } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { matchesSearch, sortStock, stockRows, STOCK_SORTS, type StockSort } from "@/server/store/inventory";
import { STOCK_STATUS, coverLabel, expiryState, hrefWith, sp1, type StockStatus } from "@/server/store/rules";
import { REG_CLASS_LABEL, type RegClass } from "@/lib/compliance";
import { zar, zarCompact } from "@/lib/money";
import { saveLevels, saveShelfPrice } from "./actions";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Table, Td, Tr, SortableTh } from "@/components/ui/table";
import { InlineEdit } from "@/components/ui/inline-edit";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ProductArt } from "@/components/product/art";
import { Chips, SearchForm } from "@/components/store/ui";
import { AutoSelect } from "@/components/store/auto-submit";
import { SavedViews } from "@/components/admin/saved-views";

export const metadata = { title: "Stock on hand" };

const PAGE_SIZE = 50;
type SP = Record<string, string | string[] | undefined>;

export default async function InventoryPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/inventory`;

  const all = await stockRows(store.id);
  const q = sp1(sp.q).trim();
  const cat = sp1(sp.cat);
  const cls = sp1(sp.cls);
  const status = sp1(sp.status) || "ALL";
  const sort: StockSort = (STOCK_SORTS as readonly string[]).includes(sp1(sp.sort)) ? (sp1(sp.sort) as StockSort) : "name";
  const dir = sp1(sp.dir) === "desc" ? "desc" : "asc";
  const page = pageParam(sp.page);

  const scoped = all.filter((r) => matchesSearch(r, q) && (!cat || r.categorySlug === cat) && (!cls || r.regClass === cls));
  const byStatus = (s: string) => (s === "ALL" ? scoped : s === "BLOCKED" ? scoped.filter((r) => r.blocked > 0) : scoped.filter((r) => r.status === s));
  const filtered = sortStock(byStatus(status), sort, dir);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Store-wide health (unfiltered).
  const ranged = all.filter((r) => r.ranged);
  const value = all.reduce((s, r) => s + r.valueCents, 0);
  const units = all.reduce((s, r) => s + Math.max(0, r.onHand), 0);
  const out = ranged.filter((r) => r.status === "OUT").length;
  const low = ranged.filter((r) => r.status === "LOW").length;
  const over = all.filter((r) => r.status === "OVER");
  const overValue = over.reduce((s, r) => s + (r.onHand > 0 ? Math.round((r.valueCents / r.onHand) * r.overUnits) : 0), 0);
  const reserved = all.reduce((s, r) => s + r.reserved, 0);
  const filteredValue = filtered.reduce((s, r) => s + r.valueCents, 0);

  const categories = [...new Map(all.map((r) => [r.categorySlug, r.category])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const classes = [...new Set(all.map((r) => r.regClass))] as RegClass[];
  const chip = (key: string, label: string, tone?: (typeof STOCK_STATUS)[StockStatus]["tone"]) => ({
    key, label, tone, count: byStatus(key).length, href: hrefWith(path, sp, { status: key === "ALL" ? null : key, page: null }),
  });
  const sortHref = (s: string, d: "asc" | "desc") => hrefWith(path, sp, { sort: s, dir: d, page: null });
  const exportHref = hrefWith(`${path}/export`, { q, cat, cls, status: status === "ALL" ? undefined : status, sort, dir });
  const rand = (c: number) => (c / 100).toFixed(2);

  return (
    <>
      <PageHeader
        overline={`Inventory · ${store.name}`}
        title="Stock on hand"
        description={`${ranged.length} ranged SKUs, valued at cost (FIFO by batch). Available = released stock less units reserved for open online orders.${canManage ? " Click a shelf price or reorder level to change it in place." : ""}`}
        actions={
          <>
            {/* A plain download link: a router <Link> fetches the CSV route once as RSC, then again as a hard navigation. */}
            <a href={exportHref} className={buttonClass("outline", "sm")} download>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </a>
            {canManage && (
              <>
                <ButtonLink href={`/store/${store.code}/adjustments`} variant="outline" size="sm">
                  <Scale className="h-4 w-4" aria-hidden /> Adjust
                </ButtonLink>
                <ButtonLink href={`/store/${store.code}/stock-takes/new`} variant="outline" size="sm">
                  <ClipboardCheck className="h-4 w-4" aria-hidden /> Count
                </ButtonLink>
                <ButtonLink href={`/store/${store.code}/purchasing/new`} size="sm">
                  <Truck className="h-4 w-4" aria-hidden /> Reorder
                </ButtonLink>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Stock value at cost" value={zarCompact(value)} sub={`${units.toLocaleString()} units on hand`} className="col-span-2 lg:col-span-1" />
        <Stat label="Out of stock" value={out.toLocaleString()} sub="ranged SKUs, nothing to sell" />
        <Stat label="At or below reorder point" value={low.toLocaleString()} sub={low || out ? <Link href={`/store/${store.code}/purchasing/new`} className="font-semibold text-brand-700 hover:underline">Build an order →</Link> : "all above reorder"} />
        <Stat label="Tied up in overstock" value={zarCompact(overValue)} sub={over.length ? <Link href={hrefWith(path, {}, { status: "OVER" })} className="font-semibold text-brand-700 hover:underline">{over.length} SKUs over target →</Link> : "nothing over target"} />
        <Stat label="Reserved for online orders" value={reserved.toLocaleString()} sub="units held for open orders" />
      </div>

      <Card className="mt-6">
        <div className="space-y-3 border-b border-ink-100 p-4 sm:p-5">
          <SearchForm path={path} q={q} keep={{ status: status === "ALL" ? undefined : status, sort: sp1(sp.sort), dir: sp1(sp.dir) }} placeholder="Search product, SKU or barcode">
            <label className="sr-only" htmlFor="inv-cat">Category</label>
            <AutoSelect id="inv-cat" name="cat" defaultValue={cat} wrapperClassName="min-w-0 flex-1 sm:w-44 sm:flex-none">
              <option value="">All categories</option>
              {categories.map(([slug, name]) => (
                <option key={slug} value={slug}>{name}</option>
              ))}
            </AutoSelect>
            <label className="sr-only" htmlFor="inv-cls">Product class</label>
            <AutoSelect id="inv-cls" name="cls" defaultValue={cls} wrapperClassName="min-w-0 flex-1 sm:w-52 sm:flex-none">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c} value={c}>{REG_CLASS_LABEL[c]}</option>
              ))}
            </AutoSelect>
            {(q || cat || cls) && (
              <Link href={hrefWith(path, {}, { status: status === "ALL" ? null : status })} className="px-2 text-xs font-semibold text-ink-500 hover:text-ink-900">
                Clear filters
              </Link>
            )}
          </SearchForm>
          <Chips
            label="Stock status"
            current={status}
            items={[
              chip("ALL", "All"),
              chip("OUT", "Out", "red"),
              chip("LOW", "Low", "amber"),
              chip("HEALTHY", "Healthy", "green"),
              chip("OVER", "Over", "violet"),
              chip("NEGATIVE", "Negative", "red"),
              chip("BLOCKED", "Blocked batches", "red"),
            ]}
          />
          <SavedViews pageKey="store-inventory" userKey={user.id} />
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<PackageSearch className="h-5 w-5" />} title="No stock matches these filters">
            Try a different search, or clear the status filter.
          </EmptyState>
        ) : (
          <Table stickyFirst minWidth="72rem">
            <thead>
              <tr>
                <SortableTh label="Item" sortKey="name" sort={sort} dir={dir} href={sortHref} />
                <SortableTh label="Status" sortKey="status" sort={sort} dir={dir} href={sortHref} />
                <SortableTh label="On hand" sortKey="onHand" sort={sort} dir={dir} href={sortHref} align="right" />
                <SortableTh label="Reserved" sortKey="reserved" sort={sort} dir={dir} href={sortHref} align="right" />
                <SortableTh label="Available" sortKey="available" sort={sort} dir={dir} href={sortHref} align="right" />
                <SortableTh label="Reorder · par" sortKey="reorder" sort={sort} dir={dir} href={sortHref} align="right" title="Reorder point · par level" />
                <SortableTh label="Shelf price" sortKey="price" sort={sort} dir={dir} href={sortHref} align="right" title="Your price; blank follows the list price" />
                <SortableTh label="Cover" sortKey="cover" sort={sort} dir={dir} href={sortHref} align="right" />
                <SortableTh label="Sold 28d" sortKey="sold" sort={sort} dir={dir} href={sortHref} align="right" />
                <SortableTh label="Value at cost" sortKey="value" sort={sort} dir={dir} href={sortHref} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STOCK_STATUS[r.status];
                const exp = expiryState(r.nextExpiry);
                const editable = canManage && r.ranged;
                return (
                  <Tr key={r.variantId} href={`${path}/${r.variantId}`}>
                    <Td className="min-w-64">
                      <div className="flex items-center gap-3">
                        <ProductArt slug={r.slug} strain={r.strain} regClass={r.regClass} className="h-9 w-9 shrink-0 overflow-hidden rounded-xl" label="" />
                        <div className="min-w-0">
                          <Link href={`${path}/${r.variantId}`} className="font-medium text-ink-900 hover:text-brand-700">
                            {r.productName} <span className="text-ink-500">· {r.variantName}</span>
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                            <span className="font-mono">{r.sku}</span>
                            <span aria-hidden>·</span>
                            <span>{r.category}</span>
                            {!r.ranged && <Badge>Not ranged</Badge>}
                            {exp.days != null && exp.days <= 30 && r.onHand > 0 && <Badge tone={exp.tone}>Next lot {exp.label.toLowerCase()}</Badge>}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <span title={meta.hint}>
                          <Badge tone={meta.tone} dot>{meta.label}</Badge>
                        </span>
                        {r.blocked > 0 && <Badge tone="red">{r.blocked} blocked</Badge>}
                      </div>
                    </Td>
                    <Td align="right" className={r.onHand < 0 ? "font-semibold text-rose-600" : undefined}>{r.onHand.toLocaleString()}</Td>
                    <Td align="right" className={r.reserved ? "text-ink-800" : "text-ink-500"}>{r.reserved.toLocaleString()}</Td>
                    <Td align="right" className={r.available <= 0 ? "font-semibold text-rose-600" : "font-semibold text-ink-950"}>{r.available.toLocaleString()}</Td>
                    <Td align="right" className="text-ink-600">
                      {editable ? (
                        <InlineEdit
                          action={saveLevels.bind(null, store.code, r.variantId)}
                          fields={[
                            { name: "reorderPoint", label: `Reorder point for ${r.name}`, value: String(r.reorderPoint), inputMode: "numeric", width: "w-14", maxLength: 4 },
                            { name: "parLevel", label: `Par level for ${r.name}`, value: String(r.parLevel), inputMode: "numeric", width: "w-14", maxLength: 4 },
                          ]}
                          display={`${r.reorderPoint} · ${r.parLevel}`}
                          editLabel={`Reorder point and par level for ${r.name}`}
                          format="join"
                          align="right"
                          saveLabel="Save levels"
                        />
                      ) : r.ranged ? (
                        `${r.reorderPoint} · ${r.parLevel}`
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td align="right">
                      {editable ? (
                        <InlineEdit
                          action={saveShelfPrice.bind(null, store.code, r.variantId)}
                          fields={[{ name: "price", label: `Shelf price for ${r.name}`, value: r.shelfCents != null ? rand(r.shelfCents) : "", prefix: "R", placeholder: rand(r.rrpCents), inputMode: "decimal", width: "w-24" }]}
                          display={r.shelfCents != null ? <span className="font-medium text-ink-900">{zar(r.shelfCents)}</span> : <span className="text-ink-500" title="Follows the list price">{zar(r.rrpCents)}</span>}
                          editLabel={`Shelf price for ${r.name} (empty follows the list price)`}
                          format="zar"
                          emptyLabel="List price"
                          align="right"
                          saveLabel="Save price"
                        />
                      ) : (
                        <span className={r.shelfCents != null ? "font-medium text-ink-900" : "text-ink-500"}>{zar(r.shelfCents ?? r.rrpCents)}</span>
                      )}
                    </Td>
                    <Td align="right" className={Number.isFinite(r.cover) && r.cover < 7 ? "font-semibold text-amber-700" : "text-ink-700"}>{coverLabel(r.cover)}</Td>
                    <Td align="right" className="text-ink-700">{r.sold28.toLocaleString()}</Td>
                    <Td align="right" className="text-ink-900">{zar(r.valueCents)}</Td>
                  </Tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={9} className="px-5 py-3 text-xs text-ink-500">
                  {filtered.length.toLocaleString()} SKUs · {filtered.reduce((s, r) => s + Math.max(0, r.onHand), 0).toLocaleString()} units
                </td>
                <td className="tnum px-5 py-3 text-right text-sm font-semibold text-ink-950">{zar(filteredValue)}</td>
              </tr>
            </tfoot>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} href={(p) => hrefWith(path, sp, { page: p })} />
        </div>
      </Card>
    </>
  );
}
