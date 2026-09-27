import Link from "next/link";
import { Scale, Tag } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { getSettings } from "@/server/settings";
import { priceRows } from "@/server/store/pricing";
import { hrefWith, sp1 } from "@/server/store/rules";
import { pct } from "@/lib/money";
import { bulkPrices, savePrices } from "./actions";
import { PriceTable } from "./price-table";
import { PageHeader, EmptyState, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Field, Input } from "@/components/ui/form";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Chips, ReadOnlyNote, SearchForm } from "@/components/store/ui";
import { AutoSelect } from "@/components/store/auto-submit";
import { Select } from "@/components/store/select";
import { ConfirmAction, FieldError } from "@/components/store/action-form";

export const metadata = { title: "Pricing" };
const PAGE_SIZE = 50;
type SP = Record<string, string | string[] | undefined>;

export default async function PricingPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/pricing`;
  const [all, settings] = await Promise.all([priceRows(store), getSettings()]);
  const min = settings.pricing.minMarginPct / 100;
  const q = sp1(sp.q).trim().toLowerCase();
  const cat = sp1(sp.cat);
  const view = ["own", "thin"].includes(sp1(sp.view)) ? sp1(sp.view) : "all";
  const page = pageParam(sp.page);

  const scoped = all.filter((r) => (!cat || r.categorySlug === cat) && (!q || `${r.name} ${r.sku}`.toLowerCase().includes(q)));
  const byView = (v: string) => (v === "own" ? scoped.filter((r) => r.shelfCents != null) : v === "thin" ? scoped.filter((r) => r.margin < min) : scoped);
  const filtered = byView(view);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const own = all.filter((r) => r.shelfCents != null);
  const thin = all.filter((r) => r.margin < min);
  const avg = all.length ? all.reduce((s, r) => s + r.margin, 0) / all.length : 0;
  const categories = [...new Map(all.map((r) => [r.categorySlug, r.category])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const keep = { cat: cat || undefined, view: view === "all" ? undefined : view };

  return (
    <>
      <PageHeader overline={`Buying · ${store.name}`} title="Pricing" description="Set your own shelf prices for your tills. Online prices are set nationally; Rewards member prices and deals apply on top of your price." />

      <Notice tone="info" className="mb-6" title="Your prices, your call">
        Herbal Holland publishes recommended retail prices (RRP) only. As an independent franchisee you decide your own selling prices — HQ never sets or enforces a minimum resale price (Competition Act 89 of 1998). The {settings.pricing.minMarginPct}% margin guide is a warning, never a block.
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ranged items" value={all.length.toLocaleString()} sub="priced at your tills" />
        <Stat label="With your own price" value={own.length.toLocaleString()} sub={own.length ? "the rest follow the list price" : "all follow the list price"} />
        <Stat label="Average margin" value={pct(avg)} sub="on shelf price, ex VAT, vs wholesale" />
        <Stat label={`Below ${settings.pricing.minMarginPct}% margin`} value={thin.length.toLocaleString()} sub={thin.length ? <Link href={hrefWith(path, {}, { view: "thin" })} className="font-semibold text-oranje-700 hover:underline">Review them →</Link> : "all above the guide"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-4">
        <Card className="min-w-0 xl:col-span-3">
          <div className="space-y-3 border-b border-ink-100 p-4 sm:p-5">
            <SearchForm path={path} q={sp1(sp.q)} keep={{ view: keep.view }} placeholder="Search product or SKU">
              <label className="sr-only" htmlFor="price-cat">Category</label>
              <AutoSelect id="price-cat" name="cat" defaultValue={cat} wrapperClassName="w-48">
                <option value="">All categories</option>
                {categories.map(([slug, name]) => (
                  <option key={slug} value={slug}>{name}</option>
                ))}
              </AutoSelect>
            </SearchForm>
            <Chips
              current={view}
              label="Show"
              items={[
                { key: "all", label: "All items", count: byView("all").length, href: hrefWith(path, sp, { view: null, page: null }) },
                { key: "own", label: "My prices", count: byView("own").length, href: hrefWith(path, sp, { view: "own", page: null }) },
                { key: "thin", label: `Below ${settings.pricing.minMarginPct}% margin`, count: byView("thin").length, tone: "amber", href: hrefWith(path, sp, { view: "thin", page: null }) },
              ]}
            />
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={<Tag className="h-5 w-5" />} title="Nothing matches" />
          ) : (
            <PriceTable key={`${page}-${view}-${cat}-${q}`} rows={rows} minMargin={min} canManage={canManage} save={savePrices.bind(null, store.code)} />
          )}
          <div className="border-t border-ink-100">
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} href={(p) => hrefWith(path, sp, { page: p })} />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Bulk change" description="Price a whole category relative to RRP, or hand it back to the recommended price." />
          <CardBody>
            {canManage ? (
              <ConfirmAction action={bulkPrices.bind(null, store.code)} label="Change a category…" triggerVariant="outline" size="md" variant="dark" title="Bulk price change" confirmLabel="Apply to category" icon={<Scale className="h-4 w-4" aria-hidden />} className="w-full">
                <Field label="Category" htmlFor="bulk-cat">
                  <Select id="bulk-cat" name="category" defaultValue={cat}>
                    <option value="">All categories ({all.length} items)</option>
                    {categories.map(([slug, name]) => (
                      <option key={slug} value={slug}>
                        {name} ({all.filter((r) => r.categorySlug === slug).length})
                      </option>
                    ))}
                  </Select>
                </Field>
                <fieldset className="space-y-2">
                  <legend className="sr-only">Change</legend>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="mode" value="pct" defaultChecked className="accent-oranje-500" /> Set to RRP plus or minus
                  </label>
                  <div className="flex items-center gap-2 pl-6">
                    <div className="w-20">
                      <Input name="pct" inputMode="decimal" defaultValue="-5" className="tnum text-right" aria-label="Percentage versus RRP" />
                    </div>
                    <span className="text-sm text-ink-600">% (rounded to the rand)</span>
                  </div>
                  <FieldError name="pct" />
                  <label className="flex items-center gap-2">
                    <input type="radio" name="mode" value="reset" className="accent-oranje-500" /> Clear my prices (follow the list price)
                  </label>
                </fieldset>
              </ConfirmAction>
            ) : (
              <ReadOnlyNote />
            )}
            <p className="mt-4 text-xs text-ink-500">
              Prices include VAT{store.company.vatNumber ? "" : " where applicable — your company isn't VAT-registered, so receipts show no VAT"}. Promotions and Rewards prices never apply to licensed medicines (Medicines Act s18A).
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
