"use client";
// Product facts at the counter: net content, declared allergens and the ingredients — for members who ask what's in
// the coffee, the protein or the cream. Works offline (the facts come with the till's catalogue).
import { AlertTriangle, Info } from "lucide-react";
import { allergenStatement, carriesFact, declaresAllergens, netContentLabel, REG_CLASS_LABEL } from "@/lib/compliance";
import { cn } from "@/lib/cn";
import { Chip, PosButton, Sheet } from "../ui";
import type { BootProduct } from "@/server/pos/types";

/** True when there's something to show: net content, ingredients or an allergen declaration (older records may have none). */
export const hasFacts = (p: BootProduct) => !!p.facts && (p.facts.netContent != null || !!p.facts.ingredients || p.facts.allergens.length > 0);

/** "1 kg · Contains: milk, soybeans" — or null for products without facts. */
export function factsLine(p: BootProduct) {
  const f = p.facts;
  if (!f) return null;
  return [netContentLabel(f.netContent, f.netUnit), allergenStatement(f.allergens)].filter(Boolean).join(" · ") || null;
}

/** Compact chips for a basket line: net content, and the allergen statement (amber when it names allergens). */
export function FactsChips({ product }: { product: BootProduct }) {
  const f = product.facts;
  if (!f) return null;
  const net = netContentLabel(f.netContent, f.netUnit);
  const allergens = allergenStatement(f.allergens);
  const warn = declaresAllergens(f.allergens);
  return (
    <>
      {net && <Chip tone="neutral">{net}</Chip>}
      {allergens && (
        <Chip tone={warn ? "amber" : "neutral"} wrap icon={warn ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> : undefined}>
          <span data-testid="line-allergens">{allergens}</span>
        </Chip>
      )}
    </>
  );
}

export function FactsSheet({ product, onClose }: { product: BootProduct | null; onClose: () => void }) {
  const f = product?.facts;
  const net = f ? netContentLabel(f.netContent, f.netUnit) : null;
  const allergens = f ? allergenStatement(f.allergens) : null;
  const warn = f ? declaresAllergens(f.allergens) : false;
  return (
    <Sheet
      open={!!product && hasFacts(product)}
      onClose={onClose}
      title={product?.name ?? ""}
      subtitle={product ? `Product facts · ${REG_CLASS_LABEL[product.regClass]}` : undefined}
      size="sm"
      footer={
        <PosButton variant="secondary" size="lg" className="w-full" onClick={onClose}>
          Done
        </PosButton>
      }
    >
      {product && f && (
        <dl className="space-y-4 text-[0.95rem]" data-testid="product-facts">
          {net && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-400">Net content</dt>
              <dd className="tnum font-display text-lg font-semibold text-white">{net}</dd>
            </div>
          )}
          {(allergens || carriesFact(product.regClass, "allergens")) && (
            <div>
              <dt className="text-ink-400">Allergens</dt>
              <dd className={cn("mt-1 flex items-start gap-2 rounded-xl px-3 py-2.5 font-semibold ring-1", warn ? "bg-amber-500/15 text-[#f3c65a] ring-amber-500/35" : "bg-ink-850 text-ink-100 ring-ink-800")}>
                {warn ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
                {allergens ?? "Not declared (check the pack)"}
              </dd>
            </div>
          )}
          {f.ingredients && (
            <div>
              <dt className="text-ink-400">Ingredients</dt>
              <dd className="mt-1 leading-relaxed text-ink-100">{f.ingredients}</dd>
            </div>
          )}
        </dl>
      )}
    </Sheet>
  );
}
