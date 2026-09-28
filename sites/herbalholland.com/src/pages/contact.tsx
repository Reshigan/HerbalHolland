// herbalholland.com/contact — the right inbox for each question, and the company's details (ECT Act s43): only those
// known in ./facts are shown; the registration, VAT number and address appear once they're filled in there.
import { BRAND, CONTACT, EMAIL } from "../../content";
import { FACTS, joinLink } from "../../facts";
import { cx } from "../art";
import { Page } from "../layout";
import { Head, Icon, MailTo } from "../ui";
import { PageHero } from "./parts";

export function ContactPage() {
  const { who, company: co } = CONTACT;
  const join = joinLink();
  const c = FACTS.company;
  const cards = [
    { key: "general", ...who.general, email: EMAIL.hello, link: null },
    { key: "franchise", ...who.franchise, email: EMAIL.franchise, link: { href: "/franchise#enquire", label: who.franchise.link } },
    { key: "press", ...who.press, email: EMAIL.press, link: { href: "/press", label: who.press.link } },
    { key: "careers", ...who.careers, email: EMAIL.careers, link: { href: "/careers", label: who.careers.link } },
    { key: "members", title: who.members.title, body: join ? who.members.body : who.members.soon, email: EMAIL.hello, link: join ? { href: join, label: who.members.link } : null },
  ];
  const rows: [string, React.ReactNode][] = [
    [c.legalName ? co.rows.legalName : co.rows.name, c.legalName ?? BRAND.name],
    ...(c.regNumber ? [[co.rows.regNumber, c.regNumber] as [string, string]] : []),
    ...(c.vatNumber ? [[co.rows.vatNumber, c.vatNumber] as [string, string]] : []),
    ...(c.address ? [[co.rows.address, c.address] as [string, string]] : []),
    ...(c.phone
      ? [
          [
            co.rows.phone,
            <a key="tel" className="link" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
              {c.phone}
            </a>,
          ] as [string, React.ReactNode],
        ]
      : []),
    [co.rows.email, <MailTo key="mail" email={EMAIL.hello} />],
  ];
  const known = c.legalName && c.regNumber && c.address;

  return (
    <Page page="contact" meta={{ path: "/contact", ...CONTACT.meta }}>
      <PageHero kind="contact" eyebrow={CONTACT.hero.eyebrow} title={CONTACT.hero.title} lede={CONTACT.hero.lede} />

      <section className="sheet sec" aria-labelledby="who-h">
        <div className="wrap">
          <Head id="who-h" eyebrow={who.eyebrow} title={who.title} />
          <ul className="inboxes" data-rs="">
            {cards.map((x) => (
              <li key={x.key} className={cx("inbox", `inbox--${x.key}`)} data-r="">
                <span className="inbox__ico">
                  <Icon name={x.key === "members" ? "join" : x.key === "franchise" ? "franchise" : x.key} />
                </span>
                <h3 className="h3">{x.title}</h3>
                <p>{x.body}</p>
                <p className="inbox__mail">
                  <MailTo email={x.email} />
                </p>
                {x.link && (
                  <a className="inbox__link" href={x.link.href}>
                    {x.link.label} <Icon name="arrow" size={16} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec" aria-labelledby="co-h">
        <div className="wrap sticky-split">
          <div className="sticky-split__side">
            <Head id="co-h" eyebrow={co.eyebrow} title={co.title} intro={known ? co.intro : undefined} />
          </div>
          <div>
            <dl className="facts" data-rs="">
              {rows.map(([k, v]) => (
                <div key={k} className="facts__row" data-r="">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="muted co__note" data-r="">
              {join ? co.franchisees : co.franchiseesSoon}
            </p>
          </div>
        </div>
      </section>
    </Page>
  );
}
