import { Suspense } from "react";
import { ProductArt } from "@/components/product/art";
import { ProductCardView } from "./product-card-view";
import { cn } from "@/lib/cn";
import type { ProductCard as Card } from "@/server/shop/catalogue";

export { ProductCardView, StockLine } from "./product-card-view";

/**
 * Server-rendered grid of product cards. Each card sits in its own Suspense boundary: the HTML still arrives in one
 * piece (a boundary under React's 12.8 KB progressive threshold is flushed inline), but the browser hydrates the cards
 * later, in small slices, instead of in the page's first long task. The art stays a server component so the merch
 * mockups never reach the browser bundle.
 */
export function ProductGrid({ items, buyable, className }: { items: Card[]; buyable?: boolean; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4", className)}>
      {items.map((p) => (
        <Suspense key={p.id}>
          <ProductCardView
            p={p}
            buyable={buyable}
            art={<ProductArt slug={p.slug} strain={p.strain} regClass={p.regClass} label={p.name} className="h-full w-full transition duration-700 group-hover:scale-[1.04]" />}
          />
        </Suspense>
      ))}
    </div>
  );
}
