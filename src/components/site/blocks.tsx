// Building blocks for the herbalholland.com pages (server components): page metadata, the dark page intro, dark and
// cream bands, section heads, cards, links and structured data. Copy lives in ./content; every link comes from
// siteLinks(process.env) so the same pages work on the site's own host and under /site.
import Link from "next/link";
import type { Metadata, ResolvingMetadata } from "next";
import { ArrowRight } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { Container } from "@/components/shop/ui";
import { BRAND } from "@/components/site/content";
import { cn } from "@/lib/cn";
import { siteLinks } from "@/lib/site";

export type Tone = "dark" | "light";
const light = (t: Tone) => t === "light";

/**
 * Title, description, canonical on the site's own address and the share card for a site page (use in
 * generateMetadata). A page's openGraph replaces its parent's, so the site's share image
 * (src/app/site/opengraph-image.tsx) is carried over from `parent`; Twitter falls back to it.
 */
export async function siteMeta(path: string, m: { title: string; description: string }, parent: ResolvingMetadata, opts: { absoluteTitle?: boolean } = {}): Promise<Metadata> {
  const url = siteLinks(process.env).abs(path);
  const title = opts.absoluteTitle ? m.title : `${m.title} · ${BRAND.name}`;
  const images = (await parent).openGraph?.images;
  return {
    title: opts.absoluteTitle ? { absolute: m.title } : m.title,
    description: m.description,
    alternates: { canonical: url },
    openGraph: { siteName: BRAND.name, type: "website", locale: "en_ZA", url, title, description: m.description, ...(images?.length ? { images } : {}) },
    twitter: { card: "summary_large_image", title, description: m.description },
  };
}

/** Absolute URL of a public file (e.g. /press/…) on the site's host — served from the app root, never under /site. */
export const siteAsset = (path: string) => new URL(path, siteLinks(process.env).abs("/")).href;

/** The shop's host name for copy ("herbalholland.co.za"). */
export const shopHost = () => new URL(siteLinks(process.env).shop("/")).host;

/** Dark page intro with the page's only h1. */
export function PageHero({ eyebrow, title, lede, children }: { eyebrow: string; title: React.ReactNode; lede: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-ink-850">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-32 h-[30rem] w-[30rem] rounded-full bg-brand-500/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -right-16 hidden text-brand-500/[0.07] md:block">
        <Mark className="h-96 w-96" title="" />
      </div>
      <Container className="relative pb-14 pt-12 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20">
        <p className="eyebrow text-brand-500">{eyebrow}</p>
        <h1 className="mt-4 max-w-4xl text-balance font-display text-[2.5rem] font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-300 sm:text-xl">{lede}</p>
        {children}
      </Container>
    </section>
  );
}

/** A full-width band: dark (warm black) or light (cream reading surface). */
export function Band({ tone = "dark", id, labelledBy, className, inner, children }: { tone?: Tone; id?: string; labelledBy?: string; className?: string; inner?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("scroll-mt-20", light(tone) ? "bg-ink-50 text-ink-700 [&_:focus-visible]:outline-brand-800" : "bg-ink-950 text-ink-300", className)}
    >
      <Container className={cn("py-16 sm:py-20 lg:py-24", inner)}>{children}</Container>
    </section>
  );
}

/** Section head: eyebrow, h2 and an optional intro. */
export function Heading({ id, eyebrow, title, intro, tone = "dark", className, children }: { id?: string; eyebrow?: string; title: React.ReactNode; intro?: React.ReactNode; tone?: Tone; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("max-w-3xl", className)}>
      {eyebrow && <p className={cn("eyebrow", light(tone) ? "text-brand-700" : "text-brand-500")}>{eyebrow}</p>}
      <h2 id={id} className={cn("mt-3 text-balance font-display text-[2rem] font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-[2.75rem]", light(tone) ? "text-ink-950" : "text-white")}>
        {title}
      </h2>
      {intro && <p className={cn("mt-4 text-[1.05rem] leading-relaxed", light(tone) ? "text-ink-600" : "text-ink-300")}>{intro}</p>}
      {children}
    </div>
  );
}

export const cardClass = (tone: Tone = "dark") => (light(tone) ? "rounded-2xl bg-white p-6 ring-1 ring-ink-150 sm:p-7" : "rounded-2xl border border-ink-800 bg-ink-900/60 p-6 sm:p-7");
export const h3Class = (tone: Tone = "dark") => cn("font-display text-xl font-semibold tracking-tight", light(tone) ? "text-ink-950" : "text-white");
export const bodyClass = (tone: Tone = "dark") => cn("text-[0.95rem] leading-relaxed", light(tone) ? "text-ink-600" : "text-ink-300");

/** Round icon holder (icons 20px, stroke 1.9). */
export function IconBadge({ tone = "dark", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span aria-hidden className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", light(tone) ? "bg-brand-100 text-brand-800" : "bg-brand-500/10 text-brand-400", className)}>
      {children}
    </span>
  );
}

/** The 18+ roundel, as in the footer. */
export function AgeBadge({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-current font-display text-[0.72rem] font-bold", className)}>
      18+
    </span>
  );
}

const linkTone = (tone: Tone) => (light(tone) ? "text-brand-800 decoration-brand-300 hover:decoration-brand-800" : "text-brand-400 decoration-brand-500/40 hover:text-brand-300 hover:decoration-brand-300");

/** An email address as a mailto link. `block` for one standing on its own: a 44px tap height (inline ones sit in a sentence). */
export function MailLink({ email, tone = "dark", block, className }: { email: string; tone?: Tone; block?: boolean; className?: string }) {
  return (
    <a href={`mailto:${email}`} className={cn("break-words font-semibold underline decoration-2 underline-offset-4 transition", block && "inline-flex min-h-11 items-center", linkTone(tone), className)}>
      {email}
    </a>
  );
}

/** Text link with an arrow and a 44px tap height. `external` for the shop and other hosts (a plain <a>). */
export function MoreLink({ href, external, tone = "dark", className, children }: { href: string; external?: boolean; tone?: Tone; className?: string; children: React.ReactNode }) {
  const cls = cn("group inline-flex min-h-11 items-center gap-1.5 font-semibold transition", light(tone) ? "text-brand-800 hover:text-ink-950" : "text-brand-400 hover:text-white", className);
  const body = (
    <>
      {children}
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" strokeWidth={1.9} aria-hidden />
    </>
  );
  return external ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/**
 * A card whose heading is the link: the link stretches over the whole card (one short link name for screen readers,
 * the whole card to tap) and the card shows the focus ring.
 */
export function LinkCard({ href, external, tone = "dark", title, cta, icon, label, highlight, children, className }: { href: string; external?: boolean; tone?: Tone; title: string; cta: string; icon?: React.ReactNode; label?: React.ReactNode; highlight?: boolean; children?: React.ReactNode; className?: string }) {
  const stretch = "after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none";
  return (
    <div
      className={cn(
        "group relative flex h-full flex-col rounded-2xl p-6 transition has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-offset-2 sm:p-7",
        light(tone)
          ? "bg-white ring-1 ring-ink-150 hover:ring-brand-700/50 has-[a:focus-visible]:ring-brand-800 has-[a:focus-visible]:ring-offset-ink-50"
          : cn("border has-[a:focus-visible]:ring-brand-500 has-[a:focus-visible]:ring-offset-ink-950", highlight ? "border-brand-500/60 bg-brand-500/[0.07] hover:border-brand-500" : "border-ink-800 bg-ink-900/60 hover:border-brand-500/60 hover:bg-ink-900"),
        className,
      )}
    >
      {(icon || label) && (
        <div className="flex items-center justify-between gap-3">
          {icon && <IconBadge tone={tone}>{icon}</IconBadge>}
          {label}
        </div>
      )}
      <h3 className={cn(h3Class(tone), "text-2xl", icon || label ? "mt-6" : null)}>
        {external ? (
          <a href={href} className={stretch}>
            {title}
          </a>
        ) : (
          <Link href={href} className={stretch}>
            {title}
          </Link>
        )}
      </h3>
      <div className={cn(bodyClass(tone), "mt-3 flex-1")}>{children}</div>
      <span aria-hidden className={cn("mt-6 inline-flex items-center gap-1.5 font-semibold transition", light(tone) ? "text-brand-800 group-hover:text-ink-950" : "text-brand-400 group-hover:text-white")}>
        {cta}
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" strokeWidth={1.9} />
      </span>
    </div>
  );
}

/** schema.org structured data. `<` is escaped so no string can close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
