import { ProductArt } from "@/components/product/art";
import { ProductCardView } from "./product-card-view";
import { cn } from "@/lib/cn";
import type { ProductCard as Card } from "@/server/shop/catalogue";

export { ProductCardView, StockLine } from "./product-card-view";

/**
 * Server-rendered grid of product cards. The card markup is a client component (ProductCardView), which keeps it out of
 * the RSC payload; the art stays a server component so the merch mockups never reach the browser bundle. (One
 * boundary per card was tried and dropped: the swaps cost more blocking time than they saved.)
 */
export function ProductGrid({
  items,
  buyable,
  className,
}: {
  items: Card[];
  buyable?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {items.map((p) => (
        <ProductCardView
          key={p.id}
          p={p}
          buyable={buyable}
          art={
            <ProductArt
              slug={p.slug}
              strain={p.strain}
              regClass={p.regClass}
              label={p.name}
              className="h-full w-full transition duration-700 group-hover:scale-[1.04]"
            />
          }
        />
      ))}
    </div>
  );
}
