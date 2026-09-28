// herbalholland.com/about — our story, why a windmill (the mark draws itself), our heritage, the standards we keep
// and who runs our stores. No partners, strains or claims beyond ./facts and the approved copy.
import { ABOUT, CHROME, HOME, fill } from "../../content";
import { greatCircleKm, listOf, longDate, newStores, openStores, provinceNames, shopLink, storeProvinces } from "../../facts";
import { Mark, MiniScene, cx } from "../art";
import { Page } from "../layout";
import { Btn, Head, Icon, Index, ShopDoor, ShopNow } from "../ui";
import { towns } from "./home";
import { PageHero } from "./parts";

export function AboutPage() {
  const { story, chapters, heritage, standards, owners, visit } = ABOUT;
  const live = !!shopLink("/");
  // The story so far: the stores that are open (no dates we don't have), then the new stores in the hill towns.
  const open = openStores();
  const fresh = newStores();
  const chapter = {
    open: towns(open),
    openProvinces: provinceNames(storeProvinces(open)),
    count: HOME.hills.count[fresh.length] ?? String(fresh.length),
    names: listOf(fresh.map((s) => s.name)),
    opening: fresh[0]?.opens ? longDate(fresh[0].opens) : "",
    km: fresh.length === 2 ? Math.round(greatCircleKm(fresh[0], fresh[1])) : "",
    provinces: provinceNames(storeProvinces(fresh)),
  };
  const items = chapters.items.filter((c) => (c.key === "open" ? open.length > 0 : c.key === "hills" ? fresh.length > 0 : true));
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
            {items.map((c) => (
              <li key={c.key} className={cx("chap", `chap--${c.key}`)} data-r="">
                <MiniScene className="chap__art" />
                <div className="chap__copy">
                  <p className="eyebrow">{c.label}</p>
                  <h3 className="h3 chap__t">{c.title}</h3>
                  <p className="chap__b">{fill("bodyOpen" in c && fresh.every((s) => s.status === "open") ? c.bodyOpen : c.body, chapter)}</p>
                  {c.key === "open" && (
                    <Btn href="/stores" kind="dark" className="btn--sm">
                      {chapters.stores}
                    </Btn>
                  )}
                  {c.key === "more" && (
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
            <p className="panel__body">{live || !open.length ? visit.body : fill(visit.soon, { open: towns(open) })}</p>
            <div className="panel__doors">
              <ShopNow page="about" />
              <Btn href="/stores" kind="ghost">
                {visit.stores}
              </Btn>
              <ShopDoor path="/learn" label={visit.learn} kind="chip" />
            </div>
          </div>
        </div>
      </section>
    </Page>
  );
}
