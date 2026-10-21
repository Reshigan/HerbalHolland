import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, Trash2 } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { getPreferredStore, shopPhase } from "@/server/shop/context";
import { canBuyOnline } from "@/lib/launch-phase";
import { listWishlist } from "@/server/shop/wishlist";
import { mainImages, productImageUrl } from "@/server/shop/images";
import { removeFromWishlist } from "@/server/shop/feature-actions";
import { ProductArt } from "@/components/product/art";
import { AddToBag } from "@/components/shop/add-to-bag";
import { StockLine } from "@/components/shop/product-card";
import { Container, Price, Tag } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Wishlist" };

export default async function ClubWishlist() {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/wishlist");
  const [store, open] = await Promise.all([getPreferredStore(), shopPhase().then(canBuyOnline)]);
  const items = await listWishlist(customer.id, { tier: customer.tier, storeId: store?.id, storeName: store?.name });
  const photos = await mainImages(items.flatMap((i) => (i.card ? [i.card.id] : [])));
  const back = items.filter((i) => i.restocked).length;

  return (
    <Container className="pt-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Your wishlist</h1>
      <p className="mt-1 text-sm text-ink-400">
        Things you&apos;ve saved with the heart. {back > 0 ? `${back} came back into stock recently.` : "We'll flag anything that comes back into stock."}
      </p>
      {items.length ? (
        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((i) => {
            const c = i.card;
            const photo = c ? photos.get(c.id) : undefined;
            return (
              <li key={i.id} className="flex gap-4 rounded-2xl border border-ink-800 bg-ink-900/60 p-4">
                {c ? (
                  <Link href={`/p/${c.slug}?v=${i.variantId}`} className="shrink-0">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={productImageUrl(photo.id)} alt="" width={96} height={96} loading="lazy" decoding="async" className="h-24 w-24 rounded-xl object-cover" />
                    ) : (
                      <ProductArt slug={c.slug} strain={c.strain} regClass={c.regClass} label={c.name} className="h-24 w-24 rounded-xl" />
                    )}
                  </Link>
                ) : (
                  <div className="grid h-24 w-24 shrink-0 place-items-center rounded-xl bg-ink-850 text-ink-600">
                    <Heart className="h-6 w-6" />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {c ? (
                        <Link href={`/p/${c.slug}?v=${i.variantId}`} className="block truncate font-semibold text-white hover:text-brand-300">
                          {c.name}
                        </Link>
                      ) : (
                        <span className="block truncate font-semibold text-ink-300">No longer in the range</span>
                      )}
                      <p className="text-sm text-ink-400">
                        {i.variantName} · saved {fmtDate(i.addedAt)}
                      </p>
                    </div>
                    {i.restocked && <Tag tone="green">Back in stock</Tag>}
                  </div>
                  {c && <StockLine stock={c.stock} online={open} className="mt-2" />}
                  <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                    {c ? <Price cents={c.priceCents} was={c.wasCents} from={i.variantCount > 1} /> : <span />}
                    <div className="flex items-center gap-2">
                      {c && i.buyable && open && <AddToBag plain variantId={i.variantId} name={`${c.name} · ${i.variantName}`} label="Add to bag" />}
                      <form action={removeFromWishlist}>
                        <input type="hidden" name="variantId" value={i.variantId} />
                        <button className="grid h-11 w-11 place-items-center rounded-full text-ink-400 hover:bg-ink-850 hover:text-white" aria-label={`Remove ${c?.name ?? "item"} from your wishlist`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center">
          <Heart className="mx-auto h-9 w-9 text-ink-600" />
          <h2 className="mt-4 font-display text-xl font-semibold text-white">Nothing saved yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-400">Tap the heart on any product to keep it here, and we&apos;ll tell you when something you want comes back into stock.</p>
          <ButtonLink href="/shop" className="mt-6">
            Shop the range
          </ButtonLink>
        </div>
      )}
    </Container>
  );
}
