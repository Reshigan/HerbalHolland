import Link from "next/link";
import { Mark } from "@/components/brand/logo";
import { Container } from "@/components/shop/ui";
import { buttonClass } from "@/components/ui/button";

// Shown inside the shop chrome when a product, store, article or order can't be found.
export default function ShopNotFound() {
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <Mark className="h-20 w-20 text-oranje-500" />
      <p className="eyebrow mt-8 text-oranje-500">Not found</p>
      <h1 className="mt-3 max-w-lg font-display text-4xl font-semibold tracking-tight text-white">That&apos;s not on our shelves</h1>
      <p className="mt-4 max-w-md leading-relaxed text-ink-300">The page may have moved or the item is no longer available. Try the range, or ask the team at your nearest store.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/shop" className={buttonClass("primary", "lg")}>
          Shop the range
        </Link>
        <Link href="/stores" className={buttonClass("outline-dark", "lg")}>
          Find a store
        </Link>
      </div>
    </Container>
  );
}
