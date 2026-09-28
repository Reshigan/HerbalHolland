// herbalholland.com/franchise: who we're looking for, what owners get, how it works (disclosure at least 14 days before
// signing — CPA franchise regulations), straight answers (no earnings, projections or investment figures: CPA s41),
// then the enquiry form. `?src=` (a LinkedIn post, an expo QR code…) is passed to the form so HQ sees where leads came from.
import type { Metadata, ResolvingMetadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  CalendarHeart,
  ChartColumn,
  Clock,
  Frame,
  GraduationCap,
  HandCoins,
  Handshake,
  IdCard,
  MonitorSmartphone,
  Package,
  Rocket,
  ShieldCheck,
  Store,
  Truck,
  UsersRound,
} from "lucide-react";
import { EnquiryForm } from "@/components/site/enquiry-form";
import { buttonClass } from "@/components/ui/button";
import { Band, Heading, IconBadge, MailLink, PageHero, bodyClass, cardClass, h3Class, siteMeta } from "@/components/site/blocks";
import { EMAIL, FRANCHISE, fill } from "@/components/site/content";
import { siteLinks } from "@/lib/site";

export const generateMetadata = (_: unknown, parent: ResolvingMetadata): Promise<Metadata> => siteMeta("/franchise", FRANCHISE.meta, parent);

const ICON = { className: "h-5 w-5", strokeWidth: 1.9 } as const;
const ICONS: Record<string, React.ReactNode> = {
  operator: <Store {...ICON} />,
  capital: <HandCoins {...ICON} />,
  standing: <UsersRound {...ICON} />,
  pharmacist: <ShieldCheck {...ICON} />,
  tills: <MonitorSmartphone {...ICON} />,
  stock: <Truck {...ICON} />,
  finance: <ChartColumn {...ICON} />,
  rewards: <IdCard {...ICON} />,
  online: <Package {...ICON} />,
  compliance: <BadgeCheck {...ICON} />,
  brand: <Frame {...ICON} />,
  playbook: <Rocket {...ICON} />,
  events: <CalendarHeart {...ICON} />,
  training: <GraduationCap {...ICON} />,
};

export default async function FranchisePage({ searchParams }: { searchParams: Promise<{ src?: string | string[] }> }) {
  const { src } = await searchParams;
  const source = typeof src === "string" ? src : undefined;
  const { hero, who, offer, steps, faq, enquire } = FRANCHISE;

  return (
    <>
      <PageHero eyebrow={hero.eyebrow} title={hero.title} lede={hero.lede}>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#enquire" className={buttonClass("primary", "xl")}>
            {hero.enquire} <ArrowRight className="h-5 w-5" strokeWidth={1.9} aria-hidden />
          </a>
          <a href="#how" className={buttonClass("outline-dark", "xl")}>
            {hero.how}
          </a>
        </div>
        <p className="mt-8 flex max-w-2xl items-start gap-3 rounded-2xl border border-brand-500/35 bg-brand-500/10 px-4 py-3.5 text-sm leading-relaxed text-brand-100">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" strokeWidth={1.9} aria-hidden />
          {hero.timing}
        </p>
      </PageHero>

      {/* ── Who we're looking for (cream) ─────────────────────────────── */}
      <Band tone="light" labelledBy="who">
        <Heading id="who" tone="light" eyebrow={who.eyebrow} title={who.title} />
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {who.items.map((i) => (
            <li key={i.key} className={cardClass("light")}>
              <IconBadge tone="light">{ICONS[i.key]}</IconBadge>
              <h3 className={`${h3Class("light")} mt-5`}>{i.title}</h3>
              <p className={`${bodyClass("light")} mt-2`}>{i.body}</p>
            </li>
          ))}
        </ul>
      </Band>

      {/* ── What owners get (dark) ────────────────────────────────────── */}
      <Band labelledBy="offer">
        <Heading id="offer" eyebrow={offer.eyebrow} title={offer.title} intro={offer.intro} />
        <div className="mt-12 space-y-12">
          {offer.groups.map((g) => (
            <div key={g.title}>
              <h3 className="flex items-center gap-3 font-display text-lg font-semibold text-white">
                <span className="h-px w-8 bg-brand-500" aria-hidden />
                {g.title}
              </h3>
              <ul className={`mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 ${g.items.length % 3 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
                {g.items.map((i) => (
                  <li key={i.key} className="flex gap-4 rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
                    <IconBadge>{ICONS[i.key]}</IconBadge>
                    <div>
                      <h4 className="font-display text-lg font-semibold text-white">{i.title}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-ink-300">{i.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Band>

      {/* ── How it works (cream) ──────────────────────────────────────── */}
      <Band tone="light" id="how" labelledBy="how-title">
        <Heading id="how-title" tone="light" eyebrow={steps.eyebrow} title={steps.title} />
        <ol className="mt-10 gap-x-12 lg:columns-2">
          {steps.items.map((s, i) => (
            <li key={s.key} className="flex break-inside-avoid gap-5 border-t border-ink-150 py-6">
              <span className="tnum grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-950 font-display text-base font-semibold text-brand-500" aria-hidden>
                {i + 1}
              </span>
              <div>
                <h3 className={h3Class("light")}>
                  <span className="sr-only">{fill(steps.step, { n: i + 1 })}</span>
                  {s.title}
                </h3>
                <p className={`${bodyClass("light")} mt-1.5 max-w-xl`}>{s.body}</p>
                {s.key === "disclosure" && (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800">
                    <Handshake className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                    {steps.badge}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Band>

      {/* ── Straight answers (dark) ───────────────────────────────────── */}
      <Band labelledBy="faq">
        <Heading id="faq" eyebrow={faq.eyebrow} title={faq.title} />
        <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
          {faq.items.map((f) => (
            <div key={f.q} className="border-t border-ink-800 pt-6">
              <h3 className="font-display text-lg font-semibold text-white">{f.q}</h3>
              <p className="mt-2 leading-relaxed text-ink-300">{f.a}</p>
            </div>
          ))}
        </div>
      </Band>

      {/* ── Enquiry ───────────────────────────────────────────────────── */}
      <Band id="enquire" labelledBy="enquire-title" className="border-t border-ink-850 bg-[radial-gradient(ellipse_at_bottom_right,rgb(245_145_60/0.08),transparent_55%)]">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
          <Heading id="enquire-title" eyebrow={enquire.eyebrow} title={enquire.title} intro={enquire.body} className="lg:sticky lg:top-28 lg:self-start">
            <p className="mt-6 text-sm leading-relaxed text-ink-400">
              {enquire.email} <MailLink email={EMAIL.franchise} />.
            </p>
          </Heading>
          <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-5 sm:p-8">
            <EnquiryForm source={source} privacyHref={siteLinks(process.env).shop("/legal/privacy")} />
          </div>
        </div>
      </Band>
    </>
  );
}
