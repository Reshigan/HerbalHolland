"use client";
// Catalogue: category rail, instant search + barcode entry, camera scan, product grid
// (with licensed / markdown / deal / limited-drop badges).
import { forwardRef, useMemo, useState } from "react";
import { Camera, Pill, Search, Sparkles, Tag, X, LayoutGrid } from "lucide-react";
import { ProductArt } from "@/components/product/art";
import { incentiveExcluded } from "@/lib/compliance";
import { categoryIcon } from "@/components/product/category-icons";
import { cn } from "@/lib/cn";
import { zarWhole, zar } from "@/lib/money";
import { livePromotions } from "../lib/pricing";
import { Chip, Sheet } from "../ui";
import { DropChip } from "./cart-panel";
import { factsLine } from "./facts-sheet";
import type { BootData, BootDrop, BootProduct, BootVariant } from "@/server/pos/types";

export type Filter = { kind: "all" } | { kind: "category"; id: string } | { kind: "deals" } | { kind: "suggestion"; label: string; productIds: string[]; categoryIds: string[] };

export const shelfPrice = (v: BootVariant) => v.shelfCents ?? v.rrpCents;

export function StockChip({ v }: { v: BootVariant }) {
  if (v.available <= 0) return <Chip tone="red">{v.available < 0 ? `${v.available}` : "0"} here</Chip>;
  if (v.available <= 3) return <Chip tone="amber">{v.available} here</Chip>;
  return <Chip tone="neutral">{v.available} here</Chip>;
}

type Props = {
  boot: BootData;
  filter: Filter;
  setFilter: (f: Filter) => void;
  query: string;
  setQuery: (q: string) => void;
  onSubmitSearch: () => void;
  onAdd: (variantId: string) => void;
  onScanCamera?: () => void;
  licensedClasses: string[];
  drops: Map<string, BootDrop>; // variant id → the drop governing it
  notice?: React.ReactNode; // phones / portrait: a prompt under the search (e.g. a welcome gift)
};

export const Catalog = forwardRef<HTMLInputElement, Props>(function Catalog({ boot, filter, setFilter, query, setQuery, onSubmitSearch, onAdd, onScanCamera, licensedClasses, drops, notice }, searchRef) {
  const [picking, setPicking] = useState<BootProduct | null>(null);

  const deals = useMemo(() => {
    const live = livePromotions(boot.promotions, new Date());
    const products = new Set(live.flatMap((p) => p.productIds));
    const cats = new Set(live.flatMap((p) => p.categoryIds));
    // Medicines never carry a deal (s18A: licensed products, and CBD supplements by default), even in a deal's category.
    const excluded = incentiveExcluded(boot.settings.compliance);
    const has = (p: BootProduct) => !excluded.includes(p.regClass) && (products.has(p.id) || cats.has(p.categoryId));
    return { has, any: boot.products.some(has) };
  }, [boot.promotions, boot.products, boot.settings.compliance]);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return boot.products.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.brand} ${p.strain ?? ""} ${p.tagline ?? ""} ${p.variants.map((v) => `${v.name} ${v.sku} ${v.barcode ?? ""}`).join(" ")}`.toLowerCase();
        return q.split(/\s+/).every((w) => hay.includes(w));
      }
      if (filter.kind === "category") return p.categoryId === filter.id;
      if (filter.kind === "deals") return deals.has(p);
      if (filter.kind === "suggestion") return filter.productIds.includes(p.id) || filter.categoryIds.includes(p.categoryId);
      return true;
    });
  }, [boot.products, query, filter, deals]);

  const pick = (p: BootProduct) => (p.variants.length === 1 ? onAdd(p.variants[0].id) : setPicking(p));

  const railItem = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string, key: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-2xl text-[0.8rem] font-semibold transition lg:w-full lg:flex-col lg:justify-center lg:gap-1.5 lg:px-1 lg:py-3",
        "h-12 px-4 lg:h-auto lg:min-h-[4.5rem]",
        active ? "bg-brand-500 text-ink-950" : "bg-ink-900 text-ink-300 ring-1 ring-ink-800 hover:text-white lg:bg-transparent lg:ring-0 lg:hover:bg-ink-900",
      )}
    >
      {icon}
      <span className="lg:text-center lg:leading-tight">{label}</span>
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Category rail (vertical on tablet, chips on phone) */}
      <nav className="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-3 pt-3 lg:w-[5.75rem] lg:flex-col lg:gap-1 lg:overflow-y-auto lg:border-r lg:border-ink-850 lg:px-2 lg:py-3" aria-label="Categories">
        {railItem(filter.kind === "all" && !query, () => (setFilter({ kind: "all" }), setQuery("")), <LayoutGrid className="h-5 w-5" />, "All", "all")}
        {deals.any && railItem(filter.kind === "deals" && !query, () => (setFilter({ kind: "deals" }), setQuery("")), <Tag className="h-5 w-5" />, "Deals", "deals")}
        {boot.categories
          .filter((c) => boot.products.some((p) => p.categoryId === c.id))
          .map((c) => {
            const Icon = categoryIcon(c.icon, Sparkles);
            return railItem(filter.kind === "category" && filter.id === c.id && !query, () => (setFilter({ kind: "category", id: c.id }), setQuery("")), <Icon className="h-5 w-5" />, c.name.replace("CBD ", ""), c.id);
          })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 pb-2 pt-3 lg:px-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
            <input
              ref={searchRef}
              type="search"
              inputMode="search"
              enterKeyHint="go"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmitSearch();
                }
              }}
              placeholder="Search or scan a barcode"
              aria-label="Search products or scan a barcode (F2)"
              className="h-12 w-full rounded-full border border-ink-800 bg-ink-900 pl-12 pr-16 text-base text-white placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-0 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-ink-400 hover:bg-ink-800">
                <X className="h-4 w-4" />
              </button>
            ) : (
              <kbd className="absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-ink-700 px-1.5 py-0.5 text-[0.65rem] font-semibold text-ink-400 lg:block">F2</kbd>
            )}
          </div>
          {onScanCamera && (
            <button type="button" onClick={onScanCamera} aria-label="Scan with the camera" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink-900 text-ink-200 ring-1 ring-ink-800 hover:text-white">
              <Camera className="h-5 w-5" />
            </button>
          )}
        </div>

        {notice && <div className="mx-3 mb-2 lg:hidden">{notice}</div>}

        {filter.kind === "suggestion" && !query && (
          <div className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-2xl bg-brand-500/10 px-4 py-1 text-sm text-brand-200 ring-1 ring-brand-500/30 lg:mx-4">
            <span>
              <b className="text-brand-300">Complete the deal:</b> {filter.label}
            </span>
            <button type="button" onClick={() => setFilter({ kind: "all" })} className="h-12 shrink-0 rounded-full px-4 font-semibold text-brand-300 hover:bg-brand-500/10">
              Show all
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 lg:px-4">
          {products.length === 0 ? (
            <div className="py-16 text-center text-ink-400">
              <p className="font-semibold text-ink-200">No products match “{query}”.</p>
              <p className="mt-1 text-sm">Check the spelling, or scan the barcode.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5" aria-label="Products">
              {products.map((p) => {
                const prices = p.variants.map(shelfPrice);
                const min = Math.min(...prices);
                const stock = p.variants.reduce((s, v) => s + Math.max(0, v.available), 0);
                const markdown = p.variants.some((v) => v.markdownPct > 0);
                const licensed = licensedClasses.includes(p.regClass);
                const deal = deals.has(p);
                const drop = p.variants.map((v) => drops.get(v.id)).find(Boolean);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pick(p)}
                      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl bg-ink-900 text-left ring-1 ring-ink-800 transition hover:ring-brand-500/60 active:scale-[0.98]"
                      aria-label={`${p.name}, ${p.variants.length > 1 ? `from ${zar(min)}` : zar(min)}, ${stock} in stock${drop ? `, limited drop, ${drop.perMemberLimit} per member` : ""}`}
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden">
                        <ProductArt slug={p.slug} strain={p.strain} regClass={p.regClass} className="h-full w-full transition duration-300 group-hover:scale-105" label="" />
                        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                          {licensed && (
                            <Chip tone="orange" className="bg-ink-950/80 backdrop-blur" icon={<Pill className="h-3 w-3" />}>
                              Licensed
                            </Chip>
                          )}
                          {drop && <DropChip drop={drop} className="bg-ink-950/80 backdrop-blur" />}
                          {markdown && <Chip tone="amber" className="bg-ink-950/80 backdrop-blur">Markdown</Chip>}
                          {deal && !licensed && <Chip tone="green" className="bg-ink-950/80 backdrop-blur">Deal</Chip>}
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5 p-3">
                        <div className="line-clamp-2 text-[0.92rem] font-semibold leading-snug text-white">{p.name}</div>
                        <div className="mt-auto flex items-end justify-between gap-2">
                          <div className="font-display text-lg font-semibold leading-none text-white tnum">
                            {p.variants.length > 1 && <span className="mr-1 text-xs font-medium text-ink-400">from</span>}
                            {zarWhole(min)}
                          </div>
                          <span className={cn("text-[0.72rem] font-semibold tnum", stock <= 0 ? "text-[#f29b9b]" : stock <= 3 ? "text-[#f3c65a]" : "text-ink-400")}>{stock} here</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Sheet open={!!picking} onClose={() => setPicking(null)} title={picking?.name ?? ""} subtitle={["Choose a size", picking && factsLine(picking)].filter(Boolean).join(" · ")} size="sm">
        {picking && (
          <ul className="space-y-2">
            {picking.variants.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => (onAdd(v.id), setPicking(null))}
                  className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl bg-ink-850 px-4 py-3 text-left ring-1 ring-ink-800 transition hover:ring-brand-500/60 active:scale-[0.99]"
                >
                  <span>
                    <span className="block text-base font-semibold text-white">{v.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                      <StockChip v={v} />
                      {drops.get(v.id) && <DropChip drop={drops.get(v.id)!} detail />}
                      {v.markdownPct > 0 && <Chip tone="amber">Near expiry −{v.markdownPct}%</Chip>}
                      <span className="font-mono">{v.sku}</span>
                    </span>
                  </span>
                  <span className="font-display text-xl font-semibold text-white tnum">{zar(shelfPrice(v))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
});
