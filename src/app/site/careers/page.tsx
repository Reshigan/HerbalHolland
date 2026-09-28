// herbalholland.com/careers: why work with us, the roles we hire in stores (with the franchisee who owns the store)
// and at HQ, and how to apply by email — we never charge to apply; POPIA: what we do with an application and for how long.
import type { Metadata, ResolvingMetadata } from "next";
import { BadgeCheck, Building2, CircleAlert, GraduationCap, Lock, Mail, MonitorSmartphone, ShieldCheck, Store, UserRound, UsersRound } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Band, Heading, IconBadge, MailLink, MoreLink, PageHero, bodyClass, cardClass, h3Class, siteMeta } from "@/components/site/blocks";
import { CAREERS, EMAIL } from "@/components/site/content";
import { siteLinks } from "@/lib/site";

export const generateMetadata = (_: unknown, parent: ResolvingMetadata): Promise<Metadata> => siteMeta("/careers", CAREERS.meta, parent);

const ICON = { className: "h-5 w-5", strokeWidth: 1.9 } as const;
const ICONS: Record<string, React.ReactNode> = {
  standards: <BadgeCheck {...ICON} />,
  training: <GraduationCap {...ICON} />,
  tools: <MonitorSmartphone {...ICON} />,
  local: <Store {...ICON} />,
  advisor: <UserRound {...ICON} />,
  manager: <UsersRound {...ICON} />,
  pharmacist: <ShieldCheck {...ICON} />,
  hq: <Building2 {...ICON} />,
};

export default function CareersPage() {
  const l = siteLinks(process.env);
  const { why, roles, apply } = CAREERS;
  const mailCv = (cls?: string) => (
    <a href={`mailto:${EMAIL.careers}`} className={buttonClass("primary", "xl", cls)}>
      <Mail className="h-5 w-5 shrink-0" strokeWidth={1.9} aria-hidden />
      {apply.cta}
    </a>
  );

  return (
    <>
      <PageHero eyebrow={CAREERS.hero.eyebrow} title={CAREERS.hero.title} lede={CAREERS.hero.lede}>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          {mailCv()}
          <MailLink email={EMAIL.careers} block className="text-sm" />
        </div>
      </PageHero>

      {/* ── Why Herbal Holland (cream) ────────────────────────────────── */}
      <Band tone="light" labelledBy="why">
        <Heading id="why" tone="light" eyebrow={why.eyebrow} title={why.title} />
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {why.items.map((i) => (
            <li key={i.key} className={cardClass("light")}>
              <IconBadge tone="light">{ICONS[i.key]}</IconBadge>
              <h3 className={`${h3Class("light")} mt-5`}>{i.title}</h3>
              <p className={`${bodyClass("light")} mt-2`}>{i.body}</p>
            </li>
          ))}
        </ul>
      </Band>

      {/* ── Roles (dark) ──────────────────────────────────────────────── */}
      <Band labelledBy="roles">
        <Heading id="roles" eyebrow={roles.eyebrow} title={roles.title} />
        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8">
          {[roles.stores, roles.hq].map((g) => (
            <div key={g.title}>
              <h3 className="flex items-center gap-3 font-display text-lg font-semibold text-white">
                <span className="h-px w-8 bg-brand-500" aria-hidden />
                {g.title}
              </h3>
              <p className="mt-2 text-sm text-ink-400">{g.note}</p>
              <ul className={`mt-5 grid grid-cols-1 gap-3 ${g.items.length > 1 ? "sm:grid-cols-3 lg:grid-cols-3" : ""}`}>
                {g.items.map((r) => (
                  <li key={r.key} className="flex h-full flex-col rounded-2xl border border-ink-800 bg-ink-900/60 p-6">
                    <IconBadge>{ICONS[r.key]}</IconBadge>
                    <h4 className="mt-5 font-display text-xl font-semibold text-white">{r.title}</h4>
                    {r.aka && <p className="text-xs font-medium uppercase tracking-wider text-ink-400">{r.aka}</p>}
                    <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-300">{r.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Band>

      {/* ── How to apply (cream) ──────────────────────────────────────── */}
      <Band tone="light" labelledBy="apply">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <Heading id="apply" tone="light" eyebrow={apply.eyebrow} title={apply.title} />
            <ol className="mt-8 space-y-6">
              {apply.steps.map((s, i) => (
                <li key={s.key} className="flex gap-5">
                  <span className="tnum grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-950 font-display text-base font-semibold text-brand-500" aria-hidden>
                    {i + 1}
                  </span>
                  <div>
                    <h3 className={h3Class("light")}>{s.title}</h3>
                    <p className={`${bodyClass("light")} mt-1.5`}>
                      {s.body} {s.key === "email" && <MailLink email={EMAIL.careers} tone="light" />}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {mailCv("mt-8")}
          </div>
          <div className="space-y-4">
            <div className={cardClass("light")}>
              <div className="flex items-center gap-4">
                <IconBadge tone="light">
                  <CircleAlert {...ICON} />
                </IconBadge>
                <h3 className={h3Class("light")}>{apply.fee.title}</h3>
              </div>
              <p className={`${bodyClass("light")} mt-3`}>
                {apply.fee.body} <MailLink email={EMAIL.careers} tone="light" />.
              </p>
            </div>
            <div className={cardClass("light")}>
              <div className="flex items-center gap-4">
                <IconBadge tone="light">
                  <Lock {...ICON} />
                </IconBadge>
                <h3 className={h3Class("light")}>{apply.popia.title}</h3>
              </div>
              <p className={`${bodyClass("light")} mt-3`}>{apply.popia.body}</p>
              <MoreLink href={l.shop("/legal/privacy")} external tone="light" className="mt-2">
                {apply.popia.link}
              </MoreLink>
            </div>
          </div>
        </div>
      </Band>
    </>
  );
}
