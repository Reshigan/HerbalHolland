// herbalholland.com/press — releases (each on its own page at /press/{slug}, NewsArticle structured data, shown from
// its date, SAST, at build time), the fact sheet from ./facts, the media contact, logo downloads and notes on how to
// write about us.
import { num } from "@/lib/format";
import { BRAND, EMAIL, PRESS, fill, releasesOn, type Release } from "../../content";
import { FACTS, listOf, longDate, nextOpening, openStores, openingStores, provinceNames, shopLink, storeProvinces } from "../../facts";
import { AgeBadge, cx } from "../art";
import { Page, abs, site } from "../layout";
import { Btn, Head, Icon, MailTo, Soon } from "../ui";
import { PageHero } from "./parts";

const V = { cap: num(FACTS.founding.cap), tier: FACTS.founding.tier, months: FACTS.founding.months };
const crumbs = [{ label: PRESS.meta.title, path: "/press" }];

/** "2 trading: Pietermaritzburg and Umhlanga · 2 opening on Tuesday 1 December 2026: Hillcrest and Hilton, in KwaZulu-Natal." */
function storesLine() {
  const facts = PRESS.facts;
  const soon = openingStores();
  const next = nextOpening();
  return [
    openStores().length ? fill(facts.values.trading, { n: openStores().length, names: listOf(openStores().map((s) => s.name)) }) : "",
    next ? fill(facts.values.opening, { n: soon.length, opening: longDate(next), names: listOf(soon.map((s) => s.name)), provinces: provinceNames(storeProvinces(soon)) }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function FactSheet({ id }: { id: string }) {
  const { facts } = PRESS;
  const shop = shopLink("/");
  const c = FACTS.company;
  const rows: [string, React.ReactNode][] = [
    [facts.rows.company, c.legalName ?? BRAND.name],
    [facts.rows.what, facts.values.what],
    [facts.rows.range, facts.values.range],
    [facts.rows.line, BRAND.line],
    [facts.rows.stores, storesLine() || facts.values.storesNone],
    [facts.rows.provinces, provinceNames(storeProvinces())],
    [facts.rows.model, facts.values.model],
    [facts.rows.membership, facts.values.membership],
    [facts.rows.founding, fill(facts.values.founding, V)],
    [facts.rows.age, facts.values.age],
    [facts.rows.quality, facts.values.quality],
    [facts.rows.medicines, facts.values.medicines],
    [
      facts.rows.online,
      shop ? (
        <a className="link" href={shop}>
          {new URL(shop).host}
        </a>
      ) : (
        <Soon label={FACTS.shop.opensLabel} kind="link" className="soon--bare" />
      ),
    ],
    ...(c.address ? [[facts.rows.office, c.address] as [string, string]] : []),
    [facts.rows.media, <MailTo key="m" email={EMAIL.press} />],
  ];
  return (
    <section className="sec" aria-labelledby={id}>
      <div className="wrap sticky-split">
        <div className="sticky-split__side">
          <Head id={id} eyebrow={facts.eyebrow} title={facts.title} />
        </div>
        <dl className="facts" data-rs="">
          {rows.map(([k, v]) => (
            <div key={k} className="facts__row" data-r="">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function PressPage() {
  const { media, assets, style } = PRESS;
  const releases = releasesOn(site.day);
  return (
    <Page page="press" stage="late" meta={{ path: "/press", ...PRESS.meta, crumbs }}>
      <PageHero kind="press" eyebrow={PRESS.hero.eyebrow} title={PRESS.hero.title} lede={PRESS.hero.lede} crumbs={crumbs}>
        <div className="ctas">
          <Btn href={`mailto:${EMAIL.press}`} icon="mail" magnetic>
            {EMAIL.press}
          </Btn>
        </div>
      </PageHero>

      <section className="sheet sec" aria-labelledby="releases-h">
        <div className="wrap">
          <Head id="releases-h" eyebrow={PRESS.releases.eyebrow} title={PRESS.releases.title} />
          {releases.length ? (
            <ol className="releases" data-rs="">
              {releases.map((r) => (
                <li key={r.slug} className="release" data-r="">
                  <time dateTime={r.date} className="release__date">
                    <Icon name="calendar" size={16} /> {longDate(r.date, { weekday: false })}
                  </time>
                  <div>
                    <h3 className="h3">
                      <a href={`/press/${r.slug}`} className="release__link">
                        {r.title}
                      </a>
                    </h3>
                    <p>{fill(r.summary, V)}</p>
                    <a href={`/press/${r.slug}`} className="inbox__link">
                      {PRESS.releases.read}
                      <span className="sr-only">: {r.title}</span> <Icon name="arrow" size={16} />
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty" data-r="">
              <span className="empty__ico">
                <Icon name="press" />
              </span>
              <span>
                {PRESS.releases.empty} <MailTo email={EMAIL.press} />.
              </span>
            </p>
          )}
        </div>
      </section>

      <FactSheet id="facts-h" />

      <section className="sheet sec" aria-labelledby="assets-h">
        <div className="wrap split split--assets">
          <div>
            <Head id="assets-h" eyebrow={assets.eyebrow} title={assets.title} intro={assets.body} />
            <div className="note note--warn media" data-r="">
              <p className="eyebrow">{media.eyebrow}</p>
              <h3 className="h3">{media.title}</h3>
              <p>{media.body}</p>
              <p>
                <MailTo email={EMAIL.press} />
              </p>
            </div>
          </div>
          <div>
            <ul className="logos" data-rs="">
              {assets.files.map((f) => (
                <li key={f.file} className="logo" data-r="">
                  <div className={cx("logo__art", `logo__art--${f.tone}`)}>
                    <img src={`/press/${"preview" in f ? f.preview : f.file}`} alt={fill(assets.alt, { colour: f.title.toLowerCase() })} width="526" height="698" loading="lazy" decoding="async" />
                  </div>
                  <div className="logo__meta">
                    <h3 className="logo__t">{f.title}</h3>
                    <p>
                      {f.format} · {f.note}
                    </p>
                    <Btn href={`/press/${f.file}`} kind="dark" icon="download" download className="btn--sm">
                      {assets.download}
                      <span className="sr-only">
                        {" "}
                        {f.title} {f.format}
                      </span>
                    </Btn>
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted assets__more" data-r="">
              {assets.more} <MailTo email={EMAIL.press} />.
            </p>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="style-h">
        <div className="wrap">
          <Head id="style-h" eyebrow={style.eyebrow} title={style.title} />
          <ul className="grid3 notes" data-rs="">
            {style.items.map((i) => (
              <li key={i.key} className="feat" data-r="">
                <span className="feat__ico">{i.key === "adults" ? <AgeBadge /> : <Icon name={i.key} />}</span>
                <h3 className="feat__t">{i.title}</h3>
                <p>{i.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Page>
  );
}

/** A release's own page. */
export function ReleasePage({ release }: { release: Release }) {
  const r = PRESS.release;
  const path = `/press/${release.slug}`;
  const trail = [...crumbs, { label: release.title, path }];
  const org = { "@type": "Organization", "@id": `${FACTS.origin}/#organization`, name: BRAND.name, logo: { "@type": "ImageObject", url: `${FACTS.origin}/press/herbal-holland-logo.png` } };
  const article = {
    "@type": "NewsArticle",
    "@id": `${abs(path)}#article`,
    headline: release.title,
    description: release.description,
    datePublished: `${release.date}T08:00:00+02:00`,
    dateModified: `${release.date}T08:00:00+02:00`,
    inLanguage: "en-ZA",
    url: abs(path),
    mainEntityOfPage: abs(path),
    image: [`${FACTS.origin}/og.png`],
    author: org,
    publisher: org,
    articleBody: release.body.map((p) => fill(p, V)).join("\n\n"),
  };
  return (
    <Page page="press" stage="late" meta={{ path, title: release.pageTitle, description: release.description, crumbs: trail }} jsonLd={article}>
      <PageHero kind="release" eyebrow={`${r.eyebrow} · ${longDate(release.date, { weekday: false })}`} title={release.title} lede={fill(release.summary, V)} crumbs={trail}>
        <div className="ctas">
          <Btn href={`mailto:${EMAIL.press}`} icon="mail" magnetic>
            {r.contact}
          </Btn>
          <Btn href="/press" kind="ghost" icon={null}>
            {r.back}
          </Btn>
        </div>
      </PageHero>
      <article className="sheet sec" aria-labelledby="page-title">
        <div className="wrap sticky-split">
          <div className="sticky-split__side">
            <p className="eyebrow" data-r="">
              {r.published}
            </p>
            <p className="release__meta" data-r="">
              <time dateTime={release.date}>{longDate(release.date)}</time>
            </p>
          </div>
          <div className="prose prose--release" data-rs="">
            {release.body.map((p) => (
              <p key={p} data-r="">
                {fill(p, V)}
              </p>
            ))}
            <p className="release__ends" data-r="">
              {r.contact}: <MailTo email={EMAIL.press} />
            </p>
          </div>
        </div>
      </article>
      <FactSheet id="facts-h" />
    </Page>
  );
}
