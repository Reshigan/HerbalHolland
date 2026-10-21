import { getCustomer } from "@/server/auth";
import { mainImages, productImageUrl } from "@/server/shop/images";
import { wishlistVariantIds } from "@/server/shop/wishlist";
import { shopPhase } from "@/server/shop/context";
import { canBuyOnline } from "@/lib/launch-phase";
import { ProductArt } from "@/components/product/art";
import { ProductCardView } from "./product-card-view";
import { cn } from "@/lib/cn";
import type { ProductCard as Card } from "@/server/shop/catalogue";

export { ProductCardView, StockLine } from "./product-card-view";

/**
 * Server-rendered grid of product cards. The card markup is a client component (ProductCardView), which keeps it out of
 * the RSC payload; the picture stays a server component (a real photo when the catalogue has one, else the generated
 * art), so the merch mockups never reach the browser bundle. (One boundary per card was tried and dropped: the swaps
 * cost more blocking time than they saved.) Members see a heart on each card for their wishlist.
 */
/** `eager`: the grid is the page's main content (the shop listing), so its first row loads at once; elsewhere every picture waits its turn. */
export async function ProductGrid({ items, buyable, className, eager = false }: { items: Card[]; buyable?: boolean; className?: string; eager?: boolean }) {
  const online = canBuyOnline(await shopPhase());
  if (buyable !== false && !online) buyable = false;
  const customer = await getCustomer();
  const [wished, photos] = await Promise.all([customer ? wishlistVariantIds(customer.id) : null, mainImages(items.map((p) => p.id))]);
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4", className)}>
      {items.map((p, i) => {
        const photo = photos.get(p.id);
        return (
          <ProductCardView
            key={p.id}
            p={p}
            buyable={buyable}
            online={online}
            wished={wished ? wished.has(p.firstVariantId) : null}
            art={
              photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={productImageUrl(photo.id)} alt={photo.alt || p.name} width={600} height={600} loading={eager && i < 4 ? "eager" : "lazy"} fetchPriority={eager && i === 0 ? "high" : undefined} decoding="async" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
              ) : (
                <ProductArt slug={p.slug} strain={p.strain} regClass={p.regClass} label={p.name} className="h-full w-full transition duration-700 group-hover:scale-[1.04]" />
              )
            }
          />
        );
      })}
    </div>
  );
}
