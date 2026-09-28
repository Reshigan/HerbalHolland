// herbalholland.com/press — releases (each shows from its date, SAST, at build time), the fact sheet from ./facts,
// the media contact, logo downloads and notes on how to write about us.
import { num } from "@/lib/format";
import { BRAND, EMAIL, PRESS, fill, releasesOn } from "../../content";
import { FACTS, longDate, shopLink } from "../../facts";
import { AgeBadge, cx } from "../art";
import { Page, site } from "../layout";
import { Btn, Head, Icon, MailTo, Soon } from "../ui";
import { PageHero } from "./parts";

export function PressPage() {
  const { facts, media, assets, style } = PRESS;
  const releases = releasesOn(site.day);
  const shop = shopLink("/");
  const c = FACTS.company;
  const stores = fill(facts.values.opening, {
    n: FACTS.stores.length,
    opening: longDate(FACTS.opening),
    names: FACTS.stores.map((s) => s.name).join(" and "),
    km: FACTS.kmBetweenStores,
  });
  const rows: [string, React.ReactNode][] = [
    [facts.rows.company, c.legalName ?? BRAND.name],
    [facts.rows.what, facts.values.what],
    [facts.rows.range, facts.values.range],
    [facts.rows.line, BRAND.line],
    [facts.rows.stores, stores],
    [facts.rows.model, facts.values.model],
    [facts.rows.membership, facts.values.membership],
    [facts.rows.founding, fill(facts.values.founding, { cap: num(FACTS.founding.cap) })],
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
    <Page page="press" meta={{ path: "/press", ...PRESS.meta }}>
      <PageHero kind="press" eyebrow={PRESS.hero.eyebrow} title={PRESS.hero.title} lede={PRESS.hero.lede}>
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
                <li key={r.date + r.title} className="release" data-r="">
                  <time dateTime={r.date} className="release__date">
                    <Icon name="calendar" size={16} /> {longDate(r.date, { weekday: false })}
                  </time>
                  <div>
                    <h3 className="h3">{r.title}</h3>
                    <p>{r.summary}</p>
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

      <section className="sec" aria-labelledby="facts-h">
        <div className="wrap sticky-split">
          <div className="sticky-split__side">
            <Head id="facts-h" eyebrow={facts.eyebrow} title={facts.title} />
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
