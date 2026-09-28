// herbalholland.com/contact: which inbox for what (members go to the shop), and the company's details from the
// franchisor record (ECT Act s43), with the legal documents on the shop.
import type { Metadata, ResolvingMetadata } from "next";
import { BriefcaseBusiness, IdCard, KeyRound, MessageCircle, Newspaper } from "lucide-react";
import { getFranchisor } from "@/server/shop/context";
import { Band, Heading, IconBadge, MailLink, MoreLink, PageHero, bodyClass, cardClass, h3Class, siteMeta } from "@/components/site/blocks";
import { BRAND, CONTACT, EMAIL } from "@/components/site/content";
import { siteLinks } from "@/lib/site";

export const generateMetadata = (_: unknown, parent: ResolvingMetadata): Promise<Metadata> => siteMeta("/contact", CONTACT.meta, parent);

const ICON = { className: "h-5 w-5", strokeWidth: 1.9 } as const;
/** tel: link for an SA number as stored ("012 004 4200" → +27120044200). */
const tel = (phone: string) => {
  const d = phone.replace(/[^\d+]/g, "");
  return `tel:${d.startsWith("0") ? `+27${d.slice(1)}` : d}`;
};

export default async function ContactPage() {
  const company = await getFranchisor();
  const l = siteLinks(process.env);
  const { who, company: co } = CONTACT;
  const memberEmail = company?.email ?? EMAIL.hello;
  const cards = [
    { key: "general", icon: <MessageCircle {...ICON} />, ...who.general, email: EMAIL.hello, link: null },
    { key: "franchise", icon: <KeyRound {...ICON} />, ...who.franchise, email: EMAIL.franchise, link: { href: `${l.page("/franchise")}#enquire`, external: false, label: who.franchise.link } },
    { key: "press", icon: <Newspaper {...ICON} />, ...who.press, email: EMAIL.press, link: { href: l.page("/press"), external: false, label: who.press.link } },
    { key: "careers", icon: <BriefcaseBusiness {...ICON} />, ...who.careers, email: EMAIL.careers, link: { href: l.page("/careers"), external: false, label: who.careers.link } },
    { key: "members", icon: <IdCard {...ICON} />, ...who.members, email: memberEmail, link: { href: l.shop("/club"), external: true, label: who.members.link } },
  ];
  const rows: [string, React.ReactNode][] = [
    [co.rows.legalName, company?.legalName ?? BRAND.name],
    ...(company?.regNumber ? [[co.rows.regNumber, company.regNumber] as [string, string]] : []),
    ...(company?.vatNumber ? [[co.rows.vatNumber, company.vatNumber] as [string, string]] : []),
    ...(company?.address ? [[co.rows.address, company.address] as [string, string]] : []),
    ...(company?.phone
      ? [
          [
            co.rows.phone,
            <a key="tel" href={tel(company.phone)} className="-my-2.5 inline-flex min-h-11 items-center font-semibold text-brand-400 underline decoration-brand-500/40 underline-offset-4 hover:decoration-brand-300">
              {company.phone}
            </a>,
          ] as [string, React.ReactNode],
        ]
      : []),
    [co.rows.email, <MailLink key="mail" email={memberEmail} block className="-my-2.5" />],
  ];

  return (
    <>
      <PageHero eyebrow={CONTACT.hero.eyebrow} title={CONTACT.hero.title} lede={CONTACT.hero.lede} />

      {/* ── Who to contact (cream) ────────────────────────────────────── */}
      <Band tone="light" labelledBy="who">
        <Heading id="who" tone="light" eyebrow={who.eyebrow} title={who.title} />
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {cards.map((c, i) => (
            <li key={c.key} className={`${cardClass("light")} flex flex-col ${i < 3 ? "lg:col-span-2" : "lg:col-span-3"} ${i === cards.length - 1 ? "sm:col-span-2 lg:col-span-3" : ""}`}>
              <IconBadge tone="light">{c.icon}</IconBadge>
              <h3 className={`${h3Class("light")} mt-5`}>{c.title}</h3>
              <p className={`${bodyClass("light")} mt-2 flex-1`}>{c.body}</p>
              <p className="mt-3">
                <MailLink email={c.email} tone="light" block />
              </p>
              {c.link && (
                <MoreLink href={c.link.href} external={c.link.external} tone="light" className="mt-1 self-start">
                  {c.link.label}
                </MoreLink>
              )}
            </li>
          ))}
        </ul>
      </Band>

      {/* ── Company details (dark) ────────────────────────────────────── */}
      <Band labelledBy="company">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <Heading id="company" eyebrow={co.eyebrow} title={co.title} intro={co.intro} />
          <div>
            <dl className="divide-y divide-ink-800 border-y border-ink-800">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
                  <dt className="text-sm font-semibold text-ink-400">{k}</dt>
                  <dd className="tnum text-[0.98rem] leading-relaxed text-ink-100">{v}</dd>
                </div>
              ))}
            </dl>
            <p className={`${bodyClass()} mt-6`}>{co.franchisees}</p>
            <MoreLink href={l.shop("/stores")} external className="mt-1">
              {co.stores}
            </MoreLink>
            <h3 className="mt-8 font-display text-lg font-semibold text-white">{co.legal.title}</h3>
            <ul className="mt-2 flex flex-wrap gap-x-6">
              {(
                [
                  [co.legal.privacy, "/legal/privacy"],
                  [co.legal.paia, "/legal/paia"],
                  [co.legal.terms, "/legal/terms"],
                ] as const
              ).map(([label, path]) => (
                <li key={path}>
                  <MoreLink href={l.shop(path)} external>
                    {label}
                  </MoreLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Band>
    </>
  );
}
