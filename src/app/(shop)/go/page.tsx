// The link in our social bios (@herbalholland on Facebook, Instagram and TikTok): one screen of big buttons on a phone.
// Social is brand-led only, so the join links carry ?src=bio and this page stays out of search.
import type { Metadata } from "next";
import { ArrowRight, BookOpen, Hash, MapPin, MessageCircle, ShoppingBag, Sparkles } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { Container } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { getFranchisor } from "@/server/shop/context";
import { getSettings } from "@/server/settings";
import { tierInfo } from "@/lib/loyalty-rules";
import { num } from "@/lib/format";

export const metadata: Metadata = {
  title: "@herbalholland",
  description: "Herbal Holland on social: join Rewards free, the Founding Members list, our stores and Learn. Adults 18+.",
  robots: { index: false, follow: false },
};

export default async function GoPage() {
  const [franchisor, { launch }] = await Promise.all([getFranchisor(), getSettings()]);
  // wa.me wants the number in international form: a local 0xx number becomes 27xx.
  const whatsapp = franchisor?.phone?.replace(/\D/g, "").replace(/^0/, "27") || null;
  const links: { href: string; label: string; note?: string; icon: React.ReactNode; primary?: boolean; external?: boolean }[] = [
    { href: "/club/join?src=bio", label: "Join Rewards", note: "free", icon: <Sparkles className="h-5 w-5" strokeWidth={1.9} />, primary: true },
    { href: "/club/join?src=bio#founding", label: "Founding Members", note: `first ${num(launch.foundingCap)}`, icon: <Hash className="h-5 w-5" strokeWidth={1.9} /> },
    { href: "/stores", label: "Our stores", icon: <MapPin className="h-5 w-5" strokeWidth={1.9} /> },
    { href: "/learn", label: "Learn", icon: <BookOpen className="h-5 w-5" strokeWidth={1.9} /> },
    ...(whatsapp ? [{ href: `https://wa.me/${whatsapp}`, label: "WhatsApp us", icon: <MessageCircle className="h-5 w-5" strokeWidth={1.9} />, external: true }] : []),
    { href: "/shop", label: "The range", icon: <ShoppingBag className="h-5 w-5" strokeWidth={1.9} /> },
  ];

  return (
    <Container className="flex min-h-[70vh] flex-col items-center pb-16 pt-10 sm:pt-16">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-ink-900 text-brand-500 ring-1 ring-ink-800">
          <Mark className="h-16 w-16" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-white">@herbalholland</h1>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-300">Sawubona, Hillcrest and Hilton. Lab-tested, plain-spoken, and glad to be your neighbour. Adults 18+.</p>

        <nav aria-label="Links" className="mt-8 flex w-full flex-col gap-3">
          {links.map((l) => (
            <ButtonLink
              key={l.href}
              href={l.href}
              size="xl"
              variant={l.primary ? "primary" : "outline-dark"}
              className="w-full justify-between px-6"
              {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <span className="flex items-center gap-3">
                {l.icon}
                {l.label}
                {l.note && <span className={l.primary ? "text-sm font-medium text-ink-800" : "text-sm font-medium text-ink-400"}>{l.note}</span>}
              </span>
              <ArrowRight className="h-5 w-5" strokeWidth={1.9} />
            </ButtonLink>
          ))}
        </nav>

        <p className="mt-8 text-xs leading-relaxed text-ink-450">
          Herbal Holland Rewards is free to join. The first {num(launch.foundingCap)} members get a numbered Founding card and {tierInfo(launch.foundingTier).name} tier for {launch.foundingMonths} months; every friend you refer moves you up {num(launch.referralBoost)} places.
        </p>
      </div>
    </Container>
  );
}
