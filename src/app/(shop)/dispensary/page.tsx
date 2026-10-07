import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { getDispensaryAccess } from "@/server/shop/access";
import { listCatalogue, PAGE_SIZE } from "@/server/shop/catalogue";
import { getPreferredStore } from "@/server/shop/context";
import { DispensaryGate } from "@/components/shop/dispensary-gate";
import { ProductGrid } from "@/components/shop/product-card";
import { Chip, Container, Meter, Pager, Panel } from "@/components/shop/ui";
import { pageParam } from "@/components/ui/pagination";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Dispensary",
  description: "Licensed cannabis medicines for registered patients with a SAHPRA Section 21 authorisation, collected in store from an authorised dispenser.",
  robots: { index: false, follow: true },
};

export default async function DispensaryPage({ searchParams }: { searchParams: Promise<{ category?: string; page?: string }> }) {
  const sp = await searchParams;
  const access = await getDispensaryAccess();
  if (!access.allowed) return <DispensaryGate access={access} />;
  const [customer, store] = await Promise.all([getCustomer(), getPreferredStore()]);
  const page = pageParam(sp.page);
  const res = await listCatalogue("licensed", { category: sp.category || undefined, page, sort: "featured" }, { tier: customer?.tier ?? null, storeId: store?.id, storeName: store?.name });
  const href = (o: { category?: string; page?: number }) => {
    const p = new URLSearchParams();
    const category = "category" in o ? o.category : sp.category;
    if (category) p.set("category", category);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return s ? `/dispensary?${s}` : "/dispensary";
  };

  return (
    <Container className="pt-10 sm:pt-14">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
        <div>
          <div className="eyebrow text-brand-500">Dispensary</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Your dispensary</h1>
          <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-ink-300">
            Medicines are collect-only and handed over by an authorised dispenser after an ID check. Prices are the same for every patient: no promotions, member prices or points apply.
          </p>
        </div>
        {access.mode === "MEDICAL" && (
          <Panel className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-leaf-500/15 text-leaf-100">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Authorisation {access.auth.authNumber}</div>
                <div className="text-xs text-ink-400">Valid until {fmtDate(access.auth.validTo)}</div>
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between text-sm">
              <span className="text-ink-300">Left in the last 30 days</span>
              <span className="tnum font-semibold text-white">
                {Math.round(access.remainingGrams * 10) / 10} g <span className="font-normal text-ink-450">/ {access.auth.monthlyLimitGrams} g</span>
              </span>
            </div>
            <Meter value={access.remainingGrams} max={access.auth.monthlyLimitGrams} className="mt-2" label="Authorised quantity remaining" />
          </Panel>
        )}
      </div>

      <div className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Categories">
        <Chip href={href({ category: undefined })} active={!sp.category}>
          All
        </Chip>
        {res.categories.map((c) => (
          <Chip key={c.slug} href={href({ category: c.slug })} active={sp.category === c.slug} count={c.count}>
            {c.name}
          </Chip>
        ))}
      </div>

      <div className="mt-8">
        {res.items.length ? (
          <>
            <h2 className="sr-only">Products</h2>
            <ProductGrid items={res.items} />
            <Pager page={page} pageSize={PAGE_SIZE} total={res.total} href={(p) => href({ page: p })} noun="products" />
          </>
        ) : (
          <p className="rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center text-ink-400">Nothing in this category right now.</p>
        )}
      </div>
    </Container>
  );
}
