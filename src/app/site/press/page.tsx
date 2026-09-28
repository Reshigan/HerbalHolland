// herbalholland.com/press: releases (each shows from its date, SAST), a fact sheet with live store counts, the media
// contact, logo downloads (public/press) and notes on how to write about us.
import type { Metadata, ResolvingMetadata } from "next";
import { CalendarDays, Camera, Download, FileText, IdCard, Mail, PenLine, ShieldCheck, UsersRound } from "lucide-react";
import { getFranchisor, getStoreFootprint } from "@/server/shop/context";
import { buttonClass } from "@/components/ui/button";
import { AgeBadge, Band, Heading, IconBadge, MailLink, PageHero, bodyClass, h3Class, shopHost, siteMeta } from "@/components/site/blocks";
import { BRAND, EMAIL, PRESS, fill, releasesOn } from "@/components/site/content";
import { TZ, dayKey, num } from "@/lib/format";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { cn } from "@/lib/cn";
import { siteLinks } from "@/lib/site";

export const generateMetadata = (_: unknown, parent: ResolvingMetadata): Promise<Metadata> => siteMeta("/press", PRESS.meta, parent);

const ICON = { className: "h-5 w-5", strokeWidth: 1.9 } as const;
const STYLE_ICON: Record<string, React.ReactNode> = {
  members: <IdCard {...ICON} />,
  cbd: <FileText {...ICON} />,
  medicines: <ShieldCheck {...ICON} />,
  pictures: <Camera {...ICON} />,
  name: <PenLine {...ICON} />,
};
const longDate = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(`${day}T12:00:00+02:00`));

export default async function PressPage() {
  const [footprint, company] = await Promise.all([getStoreFootprint(), getFranchisor()]);
  const l = siteLinks(process.env);
  const releases = releasesOn(dayKey(new Date()));
  const { facts, media, assets, style } = PRESS;
  const soon = footprint.total - footprint.trading;
  const stores = [footprint.trading > 0 && fill(facts.values.trading, { n: num(footprint.trading) }), soon > 0 && fill(facts.values.soon, { n: num(soon) })].filter(Boolean).join(" · ");
  const rows: [string, React.ReactNode][] = [
    [facts.rows.company, company?.legalName ?? BRAND.name],
    [facts.rows.what, facts.values.what],
    [facts.rows.line, BRAND.line],
    [facts.rows.stores, stores || facts.values.storesNone],
    ...(footprint.provinces.length ? [[facts.rows.provinces, footprint.provinces.map((p) => PROVINCES[p.code as ProvinceCode] ?? p.code).join(", ")] as [string, string]] : []),
    [facts.rows.model, facts.values.model],
    [facts.rows.membership, facts.values.membership],
    [facts.rows.age, facts.values.age],
    [facts.rows.quality, facts.values.quality],
    [facts.rows.medicines, facts.values.medicines],
    [
      facts.rows.online,
      <a key="shop" href={l.shop("/")} className="-my-2.5 inline-flex min-h-11 items-center font-semibold text-brand-400 underline decoration-brand-500/40 underline-offset-4 hover:decoration-brand-300">
        {shopHost()}
      </a>,
    ],
    ...(company?.address ? [[facts.rows.office, company.address] as [string, string]] : []),
  ];

  return (
    <>
      <PageHero eyebrow={PRESS.hero.eyebrow} title={PRESS.hero.title} lede={PRESS.hero.lede}>
        <a href={`mailto:${EMAIL.press}`} className={buttonClass("primary", "xl", "mt-8 max-w-full")}>
          <Mail className="h-5 w-5 shrink-0" strokeWidth={1.9} aria-hidden />
          <span className="truncate">{EMAIL.press}</span>
        </a>
      </PageHero>

      {/* ── Releases (cream) ──────────────────────────────────────────── */}
      <Band tone="light" labelledBy="releases">
        <Heading id="releases" tone="light" eyebrow={PRESS.releases.eyebrow} title={PRESS.releases.title} />
        {releases.length ? (
          <ol className="mt-10 max-w-4xl divide-y divide-ink-150 border-y border-ink-150">
            {releases.map((r) => (
              <li key={r.date + r.title} className="grid grid-cols-1 gap-2 py-7 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-8">
                <time dateTime={r.date} className="tnum flex items-center gap-2 self-start text-sm font-semibold text-brand-800 sm:pt-1">
                  <CalendarDays className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                  {longDate(r.date)}
                </time>
                <div>
                  <h3 className={h3Class("light")}>{r.title}</h3>
                  <p className={`${bodyClass("light")} mt-2`}>{r.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-8 max-w-2xl rounded-2xl bg-white p-6 text-[0.95rem] leading-relaxed text-ink-600 ring-1 ring-ink-150">
            {PRESS.releases.empty} <MailLink email={EMAIL.press} tone="light" />.
          </p>
        )}
      </Band>

      {/* ── Fact sheet (dark) ─────────────────────────────────────────── */}
      <Band labelledBy="facts">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <Heading id="facts" eyebrow={facts.eyebrow} title={facts.title} className="lg:sticky lg:top-28 lg:self-start" />
          <dl className="divide-y divide-ink-800 border-y border-ink-800">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
                <dt className="text-sm font-semibold text-ink-400">{k}</dt>
                <dd className="text-[0.98rem] leading-relaxed text-ink-100">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Band>

      {/* ── Media contact and brand assets (cream) ────────────────────── */}
      <Band tone="light" labelledBy="assets">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
          <div className="space-y-10">
            <div>
              <p className="eyebrow text-brand-700">{media.eyebrow}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink-950">{media.title}</h2>
              <p className={`${bodyClass("light")} mt-3`}>{media.body}</p>
              <p className="mt-3 text-lg">
                <MailLink email={EMAIL.press} tone="light" block />
              </p>
            </div>
            <Heading id="assets" tone="light" eyebrow={assets.eyebrow} title={assets.title} intro={assets.body} />
          </div>
          <div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {assets.files.map((f) => (
                <li key={f.file} className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-ink-150">
                  <div className={cn("grid aspect-[2/1] place-items-center p-6 sm:aspect-[4/3] sm:p-8", f.tone === "orange" ? "bg-brand-500" : "bg-ink-950")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/press/${"preview" in f ? f.preview : f.file}`} alt={fill(assets.alt, { colour: f.title.toLowerCase() })} className="h-full w-auto max-w-full object-contain" decoding="async" />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-display text-lg font-semibold text-ink-950">{f.title}</h3>
                    <p className="text-sm text-ink-600">
                      {f.format} · {f.note}
                    </p>
                    <a href={`/press/${f.file}`} download className={buttonClass("outline", "lg", "mt-4 self-start")}>
                      <Download className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                      {assets.download}
                      <span className="sr-only">
                        {" "}
                        {f.title} {f.format}
                      </span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            <p className={`${bodyClass("light")} mt-6`}>
              {assets.more} <MailLink email={EMAIL.press} tone="light" />.
            </p>
          </div>
        </div>
      </Band>

      {/* ── How to write about us (dark) ──────────────────────────────── */}
      <Band labelledBy="style">
        <Heading id="style" eyebrow={style.eyebrow} title={style.title} />
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {style.items.map((i) => (
            <li key={i.key} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-6">
              {i.key === "adults" ? <AgeBadge className="text-brand-400" /> : <IconBadge>{STYLE_ICON[i.key] ?? <UsersRound {...ICON} />}</IconBadge>}
              <h3 className={`${h3Class()} mt-5`}>{i.title}</h3>
              <p className={`${bodyClass()} mt-2`}>{i.body}</p>
            </li>
          ))}
        </ul>
      </Band>
    </>
  );
}
