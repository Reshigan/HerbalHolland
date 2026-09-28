// herbalholland.com/about: our story (Dutch heritage, African soil, the windmill), the four landraces and the grower
// partnership, and the standards we keep — lab results, members and ID, Schedule 0 CBD, licensed medicines through a
// pharmacist, and how we behave as neighbours. Facts only from the platform and the plan.
import type { Metadata, ResolvingMetadata } from "next";
import { BadgeCheck, FlaskConical, HandHeart, Handshake, Library, ShieldCheck } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";
import { AgeBadge, Band, Heading, IconBadge, MoreLink, PageHero, bodyClass, cardClass, h3Class, siteMeta } from "@/components/site/blocks";
import { ABOUT } from "@/components/site/content";
import { siteLinks } from "@/lib/site";

export const generateMetadata = (_: unknown, parent: ResolvingMetadata): Promise<Metadata> => siteMeta("/about", ABOUT.meta, parent);

const ICON = { className: "h-5 w-5", strokeWidth: 1.9 } as const;
const STANDARD_ICON: Record<string, React.ReactNode> = {
  lab: <FlaskConical {...ICON} />,
  cbd: <BadgeCheck {...ICON} />,
  medicines: <ShieldCheck {...ICON} />,
  neighbours: <Handshake {...ICON} />,
};
const PROMISE_ICON = [<HandHeart key="a" {...ICON} />, <BadgeCheck key="b" {...ICON} />, <Library key="c" {...ICON} />];

export default function AboutPage() {
  const l = siteLinks(process.env);
  const { story, heritage, standards, owners, visit } = ABOUT;
  return (
    <>
      <PageHero eyebrow={ABOUT.hero.eyebrow} title={ABOUT.hero.title} lede={ABOUT.hero.lede} />

      {/* ── Story (cream) ─────────────────────────────────────────────── */}
      <Band tone="light" labelledBy="story">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-20">
          <div>
            <Heading id="story" tone="light" eyebrow={story.eyebrow} title={story.title} />
            <div className="mt-6 max-w-2xl space-y-4 text-[1.08rem] leading-relaxed text-ink-700">
              {story.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
          <figure className="flex flex-col gap-6 rounded-2xl bg-ink-950 p-7 text-ink-300 sm:flex-row sm:items-center lg:flex-col lg:items-start">
            <Mark className="h-32 w-32 shrink-0 text-brand-500 sm:h-36 sm:w-36" title={story.windmill.label} />
            <figcaption>
              <h3 className="font-display text-xl font-semibold text-white">{story.windmill.title}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed">{story.windmill.body}</p>
            </figcaption>
          </figure>
        </div>
      </Band>

      {/* ── Heritage: four landraces (dark) ───────────────────────────── */}
      <section aria-labelledby="heritage" className="border-y border-ink-850 bg-[radial-gradient(ellipse_at_top_left,rgb(245_145_60/0.08),transparent_60%)]">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20 lg:px-8 lg:py-24">
          <div>
            <Heading id="heritage" eyebrow={heritage.eyebrow} title={heritage.title} />
            <div className="mt-6 space-y-4 text-[1.02rem] leading-relaxed text-ink-300">
              {heritage.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <ul className="mt-8 space-y-3 text-sm text-ink-200">
              {heritage.promises.map((t, i) => (
                <li key={t} className="flex items-center gap-3">
                  <IconBadge className="h-9 w-9">{PROMISE_ICON[i]}</IconBadge>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {heritage.landraces.map((r, i) => (
                <li key={r.name} className="rounded-2xl border border-ink-800 bg-ink-900/70 p-5">
                  <span className="tnum font-display text-sm font-semibold text-brand-500" aria-hidden>
                    0{i + 1}
                  </span>
                  <h3 className="mt-2 font-display text-xl font-semibold text-white">{r.name}</h3>
                  <p className="text-xs font-medium uppercase tracking-wider text-ink-400">{r.origin}</p>
                  <p className="mt-3 text-sm leading-relaxed text-ink-300">{r.note}</p>
                </li>
              ))}
            </ol>
            <blockquote className="mt-6 border-l-2 border-brand-500 pl-5 font-display text-xl font-light leading-snug text-white sm:text-2xl">{heritage.quote}</blockquote>
            <p className="mt-6 text-sm leading-relaxed text-ink-400">{heritage.law}</p>
          </div>
        </div>
      </section>

      {/* ── Standards (cream) ─────────────────────────────────────────── */}
      <Band tone="light" labelledBy="standards">
        <Heading id="standards" tone="light" eyebrow={standards.eyebrow} title={standards.title} intro={standards.intro} />
        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {standards.items.map((s, i) => (
            <article key={s.key} className={`${cardClass("light")} ${i === standards.items.length - 1 && standards.items.length % 2 ? "lg:col-span-2" : ""}`}>
              <div className="flex items-center gap-4">
                {s.key === "members" ? <AgeBadge className="text-brand-800" /> : <IconBadge tone="light">{STANDARD_ICON[s.key]}</IconBadge>}
                <h3 className={h3Class("light")}>{s.title}</h3>
              </div>
              <div className={`${bodyClass("light")} mt-4 space-y-3 ${i === standards.items.length - 1 && standards.items.length % 2 ? "lg:columns-2 lg:gap-10 lg:space-y-0 [&>p]:lg:mb-3 [&>p]:lg:break-inside-avoid" : ""}`}>
                {s.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Band>

      {/* ── Owned locally, and see for yourself (dark) ────────────────── */}
      <Band labelledBy="owners">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={cardClass()}>
            <p className="eyebrow text-brand-500">{owners.eyebrow}</p>
            <h2 id="owners" className="mt-3 font-display text-3xl font-semibold tracking-tight text-white">
              {owners.title}
            </h2>
            <p className={`${bodyClass()} mt-3 max-w-lg`}>{owners.body}</p>
            <MoreLink href={l.page("/franchise")} className="mt-4">
              {owners.cta}
            </MoreLink>
          </div>
          <div className={cardClass()}>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-white">{visit.title}</h2>
            <p className={`${bodyClass()} mt-3 max-w-lg`}>{visit.body}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={l.shop("/stores")} className={buttonClass("primary", "lg")}>
                {visit.stores}
              </a>
              <a href={l.shop("/learn")} className={buttonClass("outline-dark", "lg")}>
                {visit.learn}
              </a>
            </div>
          </div>
        </div>
      </Band>
    </>
  );
}
