import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Mark } from "@/components/brand/logo";
import { ShopSurface } from "@/components/shop/chrome";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

export default async function NotFound() {
  await connection(); // rendered per request, so its scripts carry the request's CSP nonce (src/proxy.ts)
  const play = (await cookies()).has("hh_play"); // Play Store app: rewards only, no shop
  const home = play ? "/club" : "/";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink-950 px-6 py-16 text-center text-ink-100">
      <ShopSurface />
      <Link href={home} aria-label="Herbal Holland home">
        <Mark spin className="h-24 w-24 text-brand-500" />
      </Link>
      <p className="eyebrow mt-10 text-brand-500">Error 404</p>
      <h1 className="mt-3 max-w-lg font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">We couldn&apos;t find that page</h1>
      <p className="mt-4 max-w-md leading-relaxed text-ink-300">It may have moved, or the link may be mistyped. Here are a few places to pick up from.</p>
      <nav className="mt-10 flex flex-wrap justify-center gap-3">
        <Link href={home} className={buttonClass("primary", "lg")}>
          Home
        </Link>
        {!play && (
          <Link href="/shop" className={buttonClass("outline-dark", "lg")}>
            Shop
          </Link>
        )}
        <Link href="/stores" className={buttonClass("outline-dark", "lg")}>
          Stores
        </Link>
        <Link href="/club" className={buttonClass("outline-dark", "lg")}>
          Rewards
        </Link>
      </nav>
      <p className="mt-16 text-xs text-ink-500">Herbal Holland · Adults 18+ only</p>
    </main>
  );
}
