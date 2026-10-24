import Link from "next/link";
import type { Metadata } from "next";
import { BadgePercent } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { activePromotions } from "@/server/pricing";
import { APP_URL } from "@/server/invoices";
import { ShareLink } from "@/components/shop/club-client";
import { ProductArt } from "@/components/product/art";
import { Reveal } from "@/components/shop/motion";
import { Container, Panel, Tag } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { describePromo } from "@/lib/promotions";
import { fmtDay } from "@/lib/format";

export const metadata: Metadata = {
  title: "Specials",
  description: "This month's Herbal Holland specials, online and in store: they apply automatically at checkout and at the till. Adults 18+.",
  alternates: { canonical: "/specials" },
};

const WHERE = { both: "Online and in store", ONLINE: "Online", POS: "In store" } as const;

export default async function SpecialsPage() {
  // Network-wide specials that apply on their own: no codes, no first-purchase gifts (those live on the member's card).
  const [online, inStore, customer] = await Promise.all([activePromotions({ channel: "ONLINE" }), activePromotions({ channel: "POS" }), getCustomer()]);
  const byId = new Map<string, { p: (typeof online)[number]; where: keyof typeof WHERE }>();
  for (const p of online) byId.set(p.id, { p, where: "ONLINE" });
  for (const p of inStore) byId.set(p.id, { p, where: byId.has(p.id) ? "both" : "POS" });
  const specials = [...byId.values()].filter(({ p }) => !p.code && !p.firstPurchaseOnly).sort((a, b) => +a.p.endsAt - +b.p.endsAt);
  const ids = [...new Set(specials.flatMap(({ p }) => (p.productIds.length === 1 ? p.productIds : [])))];
  const products = ids.length ? await db.product.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { id: true, slug: true, name: true, strain: true, regClass: true } }) : [];
  const base = APP_URL();
  const shareUrl = customer ? `${base}/club/join?ref=${customer.referralCode}&next=/specials` : `${base}/specials`;

  return (
    <Container className="pt-10 sm:pt-14">
      <div className="max-w-2xl">
        <div className="eyebrow text-brand-500">Specials</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">This month&apos;s specials.</h1>
        <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-300">
          They come off automatically at checkout and at the till, on top of your member price. No codes to remember.
        </p>
      </div>

      {specials.length ? (
        <Reveal stagger className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {specials.map(({ p, where }) => {
            const product = products.find((x) => p.productIds.includes(x.id));
            return (
              <Panel key={p.id} className="flex h-full flex-col p-5">
                <div className="flex items-start gap-4">
                  {product ? (
                    <ProductArt slug={product.slug} strain={product.strain} regClass={product.regClass} label={product.name} className="h-16 w-16 shrink-0 rounded-2xl" />
                  ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-400">
                      <BadgePercent className="h-7 w-7" strokeWidth={1.9} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <Tag tone="orange">{describePromo(p)}</Tag>
                    <h2 className="mt-2 font-display text-lg font-semibold text-white">{p.name}</h2>
                  </div>
                </div>
                {p.description && <p className="mt-3 text-sm leading-relaxed text-ink-300">{p.description}</p>}
                <p className="mt-auto pt-4 text-xs text-ink-450">
                  {WHERE[where]} · until {fmtDay(p.endsAt)}
                </p>
                {product && (
                  <Link href={`/p/${product.slug}`} className="mt-3 text-sm font-semibold text-brand-400 hover:underline">
                    See {product.name}
                  </Link>
                )}
              </Panel>
            );
          })}
        </Reveal>
      ) : (
        <div className="mx-auto mt-12 max-w-lg rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center">
          <BadgePercent className="mx-auto h-10 w-10 text-brand-500" strokeWidth={1.5} />
          <h2 className="mt-5 font-display text-2xl font-semibold text-white">The next specials are on their way</h2>
          <p className="mx-auto mt-3 max-w-sm text-ink-400">Members already get an instant member price on every visit, in store and online.</p>
          {!customer && (
            <ButtonLink href="/club/join?next=/specials" size="lg" className="mt-8">
              Join Rewards free
            </ButtonLink>
          )}
        </div>
      )}

      <Panel className="mt-10 max-w-2xl p-5">
        <h2 className="font-display text-lg font-semibold text-white">Share the specials</h2>
        <p className="mb-4 mt-1 text-sm text-ink-300">
          {customer ? "Your link brings friends (18+) to join Rewards first, then straight here." : "Send this page to a friend (18+)."}
        </p>
        <ShareLink
          url={shareUrl}
          text="This month's Herbal Holland specials, online and in store. Adults 18+:"
          shareLabel="Share the specials"
          status={customer ? `/s/${customer.referralCode}/status` : undefined}
        />
      </Panel>
    </Container>
  );
}
