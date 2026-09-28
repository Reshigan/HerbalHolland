"use client";
// Stock lookup: on hand here (less online reservations) and what nearby stores in the region have.
import { useEffect, useRef, useState } from "react";
import { Boxes, MapPin, Plus, Search } from "lucide-react";
import { ProductArt } from "@/components/product/art";
import { zar } from "@/lib/money";
import { api, errorText } from "./lib/api";
import { usePos } from "./context";
import { Alert, Chip, EmptyPanel, PosButton, Spinner, TextInput } from "./ui";
import type { StockHit } from "@/server/pos/types";

export function StockLookup({ onAdd }: { onAdd: (variantId: string) => void }) {
  const pos = usePos();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<StockHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const sellable = new Set(pos.boot.products.flatMap((p) => p.variants.map((v) => v.id)));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ results: StockHit[] }>(`/api/pos/stock?q=${encodeURIComponent(term)}`);
        if (n === seq.current) (setHits(r.results), setError(null));
      } catch (e) {
        if (n === seq.current) setError(errorText(e));
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto w-full max-w-4xl px-4 pb-3 pt-4">
        <h1 className="font-display text-xl font-semibold text-white">Stock lookup</h1>
        <p className="text-sm text-ink-400">What&apos;s on the shelf here, and which nearby stores can help today.</p>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
          <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product, strain, SKU or barcode" aria-label="Search stock" className="h-14 rounded-full pl-12 text-lg" />
          {loading && <Spinner className="absolute right-5 top-1/2 -translate-y-1/2" />}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto max-w-4xl">
          {!pos.online && <Alert tone="warn">Offline — stock lookup needs a connection. The Sell screen still shows this store&apos;s last known stock.</Alert>}
          {error && <Alert>{error}</Alert>}
          {!hits && !loading && pos.online && (
            <EmptyPanel icon={<Boxes className="h-6 w-6" />} title="Search the network">
              Type at least two letters — e.g. “grinder”, “Durban”, or scan a barcode into the box.
            </EmptyPanel>
          )}
          {hits?.length === 0 && <p className="py-10 text-center text-sm text-ink-400">Nothing matches “{q.trim()}”.</p>}
          <ul className="space-y-3">
            {hits?.map((h) => (
              <li key={h.variantId} className="rounded-3xl bg-ink-900 p-4 ring-1 ring-ink-800">
                <div className="flex gap-4">
                  <span aria-hidden className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl">
                    <ProductArt slug={h.slug} strain={h.strain} regClass={h.regClass} className="h-full w-full" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-white">
                          {h.name} · {h.variantName}
                        </div>
                        <div className="font-mono text-xs text-ink-500">
                          {h.sku}
                          {h.barcode ? ` · ${h.barcode}` : ""}
                        </div>
                      </div>
                      <div className="font-display text-lg font-semibold text-white tnum">{zar(h.priceCents)}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Chip tone={h.here.available > 3 ? "green" : h.here.available > 0 ? "amber" : "red"}>{h.here.available} available here</Chip>
                      {h.here.reserved > 0 && <Chip tone="neutral">{h.here.reserved} held for online orders</Chip>}
                      {sellable.has(h.variantId) && (
                        <PosButton variant="secondary" size="sm" onClick={() => onAdd(h.variantId)}>
                          <Plus className="h-4 w-4" /> Add to sale
                        </PosButton>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 border-t border-ink-850 pt-3">
                  <div className="eyebrow mb-2 text-[0.6rem] text-ink-400">Nearby stores</div>
                  {h.nearby.length ? (
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {h.nearby.map((n) => (
                        <li key={n.code} className="flex items-center justify-between gap-2 rounded-2xl bg-ink-850 px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-white">{n.name}</span>
                            <span className="flex items-center gap-1 text-xs text-ink-400">
                              <MapPin className="h-3 w-3" />
                              {n.distanceKm != null ? `${n.distanceKm} km` : n.suburb}
                            </span>
                          </span>
                          <span className="font-semibold text-white tnum">{n.available}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-500">No other store in the region has this in stock.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

