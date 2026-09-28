// herbalholland.com/about — our story, why a windmill (the mark draws itself), our heritage, the standards we keep
// and who runs our stores. No partners, strains or claims beyond ./facts and the approved copy.
import { ABOUT, CHROME, fill } from "../../content";
import { firstStores, greatCircleKm, listOf, longDate, nextOpening, provinceNames, shopLink, storeProvinces } from "../../facts";
import { Mark, MiniScene, cx } from "../art";
import { Page } from "../layout";
import { Btn, Head, Icon, Index, ShopDoor } from "../ui";
import { PageHero } from "./parts";

export function AboutPage() {
  const { story, chapters, heritage, standards, owners, visit } = ABOUT;
  const live = !!shopLink("/");
  const first = firstStores();
  const next = nextOpening();
  const chapter = {
    names: listOf(first.map((s) => s.name)),
    opening: longDate(first[0].opens),
    km: first.length === 2 ? Math.round(greatCircleKm(first[0], first[1])) : "",
    provinces: provinceNames(storeProvinces(first)),
  };
  return (
    <Page page="about" meta={{ path: "/about", ...ABOUT.meta }}>
      <PageHero kind="about" eyebrow={ABOUT.hero.eyebrow} title={ABOUT.hero.title} lede={ABOUT.hero.lede} />

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
        <div className="wrap chaps">
          <Head id="chapters-h" eyebrow={chapters.eyebrow} title={chapters.title} intro={chapters.intro} />
          <ol className="chaps__list" data-rs="">
            {chapters.items.map((c, i) => (
              <li key={c.key} className={cx("chap", `chap--${c.key}`)} data-r="">
                {i === 0 && <MiniScene className="chap__art" />}
                <div className="chap__copy">
                  <p className="eyebrow">{c.label}</p>
                  <h3 className="h3 chap__t">{c.title}</h3>
                  <p className="chap__b">{fill(c.body, chapter)}</p>
                  {i === 0 ? (
                    <Btn href="/stores" kind="dark" className="btn--sm">
                      {chapters.stores}
                    </Btn>
                  ) : (
                    <Btn href="/franchise" className="btn--sm">
                      {chapters.own}
                    </Btn>
                  )}
                </div>
              </li>
            ))}
          </ol>
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
            <ul className="ticks" data-rs="">
              {heritage.promises.map((t) => (
                <li key={t} data-r="">
                  <svg viewBox="0 0 24 24" className="tick" aria-hidden="true" focusable="false">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m7.5 12.5 3 3 6-7" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
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

      <section className="sec" aria-label={owners.eyebrow}>
        <div className="wrap panels" data-rs="">
          <div className="panel" data-r="">
            <p className="eyebrow">{owners.eyebrow}</p>
            <h2 className="h2 panel__title">{owners.title}</h2>
            <p className="panel__body">{owners.body}</p>
            <Btn href="/franchise" magnetic>
              {owners.cta}
            </Btn>
          </div>
          <div className={cx("panel", !live && "panel--soon")} data-r="">
            <p className="eyebrow">{CHROME.cta.finder}</p>
            <h2 className="h2 panel__title">{visit.title}</h2>
            <p className="panel__body">{live || !next ? visit.body : fill(visit.soon, { opening: longDate(next) })}</p>
            <div className="panel__doors">
              <Btn href="/stores">{visit.stores}</Btn>
              <ShopDoor path="/learn" label={visit.learn} kind="chip" />
            </div>
          </div>
        </div>
      </section>
    </Page>
  );
}
