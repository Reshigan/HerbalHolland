// herbalholland.com/about — our story, why a windmill (the mark draws itself), our heritage, the standards we keep
// and the way in. No partners, strains or claims beyond ./facts and the approved copy.
import { ABOUT, fill } from "../../content";
import { openStores, shopLink } from "../../facts";
import { Mark } from "../art";
import { Page } from "../layout";
import { Btn, Head, Icon, Index, ShopNow } from "../ui";
import { towns } from "./home";
import { PageHero } from "./parts";

export function AboutPage() {
  const { story, heritage, standards, visit } = ABOUT;
  const live = !!shopLink("/");
  const open = openStores();
  const crumbs = [{ label: ABOUT.meta.title, path: "/about" }];
  return (
    <Page page="about" stage="gold" meta={{ path: "/about", ...ABOUT.meta, crumbs }}>
      <PageHero kind="about" eyebrow={ABOUT.hero.eyebrow} title={ABOUT.hero.title} lede={ABOUT.hero.lede} crumbs={crumbs} />

      <section className="sheet sec" aria-labelledby="story-h">
        <div className="wrap split split--story">
          <div>
            <Head id="story-h" eyebrow={story.eyebrow} title={story.title} />
            <div className="prose" data-rs="">
              {story.paragraphs.map((p) => (
                <p key={p} data-r="">
                  {p}
                </p>
              ))}
            </div>
          </div>
          <figure className="build" data-r="build">
            <Mark className="build__mark" sails="spin" title={story.windmill.label} />
            <figcaption>
              <h3 className="h3">{story.windmill.title}</h3>
              <p>{story.windmill.body}</p>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="sec heritage" aria-labelledby="heritage-h">
        <div className="wrap split">
          <div>
            <Head id="heritage-h" eyebrow={heritage.eyebrow} title={heritage.title} />
            <div className="prose prose--dark" data-rs="">
              {heritage.paragraphs.map((p) => (
                <p key={p} data-r="">
                  {p}
                </p>
              ))}
            </div>
          </div>
          <div className="heritage__side">
            <blockquote className="quote" data-r="">
              <p>{heritage.quote}</p>
            </blockquote>
            <dl className="landraces" data-rs="">
              {heritage.landraces.map((l) => (
                <div key={l.name} className="landrace" data-r="">
                  <dt>
                    {l.name} <span>{l.origin}</span>
                  </dt>
                  <dd>{l.note}</dd>
                </div>
              ))}
            </dl>
            <p className="muted" data-r="">
              {heritage.law}
            </p>
          </div>
        </div>
      </section>

      <section className="sheet sec" aria-labelledby="rules-h">
        <div className="wrap">
          <Head id="rules-h" eyebrow={standards.eyebrow} title={standards.title} intro={standards.intro} />
          <ol className="rules">
            {standards.items.map((s, i) => (
              <li key={s.key} className="rule" data-r="">
                <div className="rule__head">
                  <Index n={i + 1} className="rule__n" />
                  <span className="rule__ico">
                    <Icon name={s.key} />
                  </span>
                </div>
                <h3 className="h3 rule__title">{s.title}</h3>
                <div className="rule__body">
                  {s.paragraphs.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec" aria-labelledby="visit-h">
        <div className="wrap panel panel--wide" data-r="">
          <p className="eyebrow">{visit.eyebrow}</p>
          <h2 id="visit-h" className="h2 panel__title">
            {visit.title}
          </h2>
          <p className="panel__body">{live || !open.length ? visit.body : fill(visit.soon, { open: towns(open) })}</p>
          <div className="panel__doors">
            <ShopNow page="about" magnetic />
            <Btn href="/stores" kind="ghost">
              {visit.stores}
            </Btn>
            <a className="link" href="/franchise">
              {visit.own}
            </a>
          </div>
        </div>
      </section>
    </Page>
  );
}
