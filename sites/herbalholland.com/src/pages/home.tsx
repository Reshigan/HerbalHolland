// herbalholland.com — the home page, brand-first: the storefront at dusk (its sign switches on as the page opens),
// what Herbal Holland stands for, what's on the shelf, the 9,475 km from Amsterdam to South Africa, the first stores in
// the KwaZulu-Natal hills, the map of stores as they open across the country, and Founding Members. Every count, date,
// place and pin comes from the stores list in ../../facts.
import { num } from "@/lib/format";
import { PROVINCES } from "@/lib/sa";
import { BRAND, CHROME, EMAIL, HOME, fill, plural } from "../../content";
import { FACTS, firstStores, greatCircleKm, joinLink, listOf, longDate, nextOpening, openStores, openingStores, provinceNames, shopLink, shortDay, storeProvinces } from "../../facts";
import { AgeBadge, Globe, Mark, MiniScene, SCENES, Sails, Scene, cx } from "../art";
import { JoinDoor, Page } from "../layout";
import { ZaMap } from "../map";
import { ShelfArt } from "../shelf";
import { Storefront } from "../storefront";
import { Btn, Head, Icon, Index, Keep, Reel, Words } from "../ui";

const dms = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
export const coords = (p: { lat: number; lon: number }) => `${dms(p.lat, "N", "S")} · ${dms(p.lon, "E", "W")}`;

/** "Our first stores open in KwaZulu-Natal on Tuesday 1 December 2026…", or, once every store is open, the plain line. */
export function openingLine(soon: string, open: string) {
  const next = nextOpening();
  if (!next) return fill(open, { provinces: provinceNames(storeProvinces()) });
  return fill(soon, { provinces: provinceNames(storeProvinces(openingStores())), opening: longDate(next) });
}

/** The same line for the page, with province names kept whole across line breaks. */
export const OpeningLine = ({ soon, open }: { soon: string; open: string }) => <Keep text={openingLine(soon, open)} names={Object.values(PROVINCES)} />;

function Hero() {
  const h = HOME.hero;
  return (
    <section className="hero" data-sp="exit" aria-labelledby="hero-title">
      <Storefront className="hero__sf" />
      <div className="wrap hero__in">
        <p className="eyebrow" data-in="1">
          {h.eyebrow}
        </p>
        <h1 id="hero-title" className="hero__title rise">
          <Words text={h.title} accent />
        </h1>
        <p className="hero__kicker" data-in="2">
          <span>
            <OpeningLine soon={h.kicker} open={h.kickerOpen} />
          </span>
        </p>
        <div className="ctas" data-in="3">
          <Btn href="#founding" magnetic className="btn--hero">
            {h.primary}
          </Btn>
          <Btn href="/stores" kind="ghost" className="btn--hero">
            {h.secondary}
          </Btn>
        </div>
        <p className="hero__age" data-in="4">
          <AgeBadge />
          <span>{h.note}</span>
        </p>
      </div>
      <div className="wrap hero__foot" data-in="4">
        <a className="cue" href="#brand">
          <span className="cue__line" aria-hidden="true" />
          <span>{h.cue}</span>
        </a>
      </div>
    </section>
  );
}

/** What we are, in one sentence, big: each word lights up as it's read on the way down. */
function Statement() {
  return (
    <section className="statement" id="brand" data-sp="center">
      <div className="wrap">
        <p className="statement__p" data-words="">
          {HOME.statement.split(" ").map((w, i) => (
            <span key={i} className="sw">
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

/** What Herbal Holland stands for: four cards, each with its own small picture. */
function Brand() {
  const b = HOME.brand;
  const visual: Record<string, React.ReactNode> = {
    heritage: (
      <div className="rx" aria-hidden="true">
        <Mark className="rx__mark" sails="spin" />
      </div>
    ),
    lab: (
      <div className="lab" aria-hidden="true">
        <span className="lab__k">
          {b.demo.label} <em>{b.demo.example}</em>
        </span>
        <span className="lab__code">
          <span data-type="">{b.demo.code}</span>
          <span className="caret" />
        </span>
        <span className="lab__ok">
          <svg viewBox="0 0 24 24" className="tick" focusable="false">
            <circle cx="12" cy="12" r="10" />
            <path d="m7.5 12.5 3 3 6-7" />
          </svg>
          {b.demo.check}
        </span>
      </div>
    ),
    members: (
      <div className="rx" aria-hidden="true">
        <Icon name="members" size={30} />
        <span>{b.members.id}</span>
      </div>
    ),
    rewards: (
      <div className="rx" aria-hidden="true">
        <div className="rcard">
          <Mark className="rcard__mark" />
          <p className="rcard__t">
            {BRAND.name}
            <b>{b.rewards}</b>
          </p>
        </div>
      </div>
    ),
  };
  return (
    <section className="sheet sec standards" aria-labelledby="brand-title">
      <div className="wrap">
        <div className="split">
          <Head id="brand-title" eyebrow={b.eyebrow} title={b.title} intro={b.intro} />
          <div className="split__end" data-r="">
            <Btn href="/about" kind="dark">
              {b.cta}
            </Btn>
          </div>
        </div>
        <ul className="cards" data-rs="">
          {b.items.map((it, i) => (
            <li key={it.key} className={cx("card", `card--${it.key}`)} data-tilt="" data-r="">
              <div className="card__in">
                <div className="card__top">
                  <Index n={i + 1} />
                  <Icon name={it.key} className="card__ico" />
                </div>
                <div className="card__vis">{visual[it.key]}</div>
                <h3 className="card__title">{it.title}</h3>
                <p className="card__body">{fill(it.body, { cap: num(FACTS.founding.cap) })}</p>
                <span className="glare" aria-hidden="true" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Marquee() {
  const words = HOME.marquee.words;
  return (
    <section className="marquee" aria-label={HOME.marquee.label} data-marquee="">
      <ul className="sr-only">
        {words.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <div className="marquee__track" aria-hidden="true">
        {[0, 1].map((k) => (
          <div key={k} className="marquee__set">
            {words.map((w) => (
              <span key={w} className="marquee__item">
                <span className="marquee__w">{w}</span>
                <svg className="marquee__sep" viewBox="-36 -36 72 72" focusable="false">
                  <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <Sails js="wind" />
                  </g>
                </svg>
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** On the shelf: a cubby per category, each with one illustrated product on an oak shelf; the shop's door last. */
function Shelf() {
  const s = HOME.shelf;
  const shop = shopLink("/");
  const Cubby = ({ kind }: { kind: string }) => (
    <div className="cat__cubby" aria-hidden="true">
      <span className="cat__plank" />
      <ShelfArt kind={kind} className="cat__art" />
    </div>
  );
  return (
    <section className="sheet sec shelf" aria-labelledby="shelf-title">
      <div className="wrap">
        <div className="split">
          <Head id="shelf-title" eyebrow={s.eyebrow} title={s.title} intro={s.intro} />
          <p className="shelf__note muted" data-r="">
            <Icon name="medicines" size={16} /> {s.note}
          </p>
        </div>
        <ul className="cats" data-rs="">
          {s.items.map((it) => {
            const href = shopLink(FACTS.shelf[it.key] ?? "/shop");
            return (
              <li key={it.key} className="cat" data-r="" data-cursor={href ? undefined : CHROME.cursorSoon}>
                <Cubby kind={it.key} />
                <h3 className="cat__t">
                  {href ? (
                    <a className="stretch" href={href}>
                      {it.title}
                    </a>
                  ) : (
                    <>
                      {it.title}
                      <span className="sr-only">{CHROME.soonSr}</span>
                    </>
                  )}
                </h3>
                <p className="cat__b">{it.body}</p>
                {href && (
                  <span className="cat__go" aria-hidden="true">
                    {fill(s.go, { name: it.title })} <Icon name="arrow" size={16} />
                  </span>
                )}
              </li>
            );
          })}
          <li className="cat cat--shop" data-r="" data-cursor={shop ? undefined : CHROME.cursorSoon}>
            <Cubby kind="shop" />
            <h3 className="cat__t">
              {shop ? (
                <a className="stretch" href={shop}>
                  {s.shop.title}
                </a>
              ) : (
                s.shop.title
              )}
            </h3>
            <p className="cat__b">{shop ? s.shop.body : s.shop.soon}</p>
            {!shop && (
              <span className="soon__badge" aria-hidden="true">
                <span className="soon__dot" />
                {FACTS.shop.opensLabel}
              </span>
            )}
          </li>
        </ul>
      </div>
    </section>
  );
}

/** A number the story counts up to: an unseen copy of the final value holds its width, so nothing beside it moves. */
function Count({ value, attr }: { value: string; attr: "data-km" | "data-km-big" }) {
  return (
    <span className="count">
      <span className="count__hold" aria-hidden="true">
        {value}
      </span>
      <span {...{ [attr]: "" }}>{value}</span>
    </span>
  );
}

/** The 9,475 km story: pinned while an arc draws from Amsterdam to our first store, with a pin for every store. */
function Journey() {
  const j = HOME.journey;
  const first = firstStores()[0];
  const km = num(FACTS.km[first.key]);
  const here = coords(first).split(" · ");
  return (
    <section className="story" id="journey" aria-labelledby="story-title" data-story="">
      <div className="story__pin">
        <div className="wrap story__grid">
          <div className="story__head">
            <p className="eyebrow">{j.eyebrow}</p>
            <h2 id="story-title" className="story__title">
              <span className="sr-only">{fill(j.sr, { km, city: first.city })}</span>
              <span className="story__big" aria-hidden="true">
                <Count value={km} attr="data-km-big" />
                <span className="story__unit">{j.unit}</span>
              </span>
              <span className="story__sub" aria-hidden="true">
                {j.title}
              </span>
            </h2>
            <p className="story__lede">{j.lede}</p>
          </div>
          <div className="story__globe">
            <Globe label={fill(j.caption, { from: coords(FACTS.places.amsterdam), to: coords(first), city: first.city, km })} />
          </div>
          <dl className="readout" aria-hidden="true">
            <div>
              <dt>{j.readout.lat}</dt>
              <dd data-lat="">{here[0]}</dd>
            </div>
            <div>
              <dt>{j.readout.lon}</dt>
              <dd data-lon="">{here[1]}</dd>
            </div>
            <div>
              <dt>{j.readout.dist}</dt>
              <dd>
                <Count value={km} attr="data-km" /> {j.unit}
              </dd>
            </div>
          </dl>
          <ol className="chapters">
            {j.chapters.map((c, i) => (
              <li key={c.key} className="chapter" data-chapter="">
                <p className="chapter__n">
                  <Index n={i + 1} /> {c.label}
                </p>
                <h3 className="chapter__title">{c.title}</h3>
                <p className="chapter__body">{c.key === "welcome" ? <OpeningLine soon={c.body} open={HOME.hero.kickerOpen} /> : c.body}</p>
              </li>
            ))}
          </ol>
          <div className="story__bar" aria-hidden="true">
            {j.chapters.map((c) => (
              <span key={c.key}>
                <i />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The first chapter: Holland, meet the Hills. The sunset over the hill towns, and a card for each first store. */
function First() {
  const f = HOME.first;
  const stores = firstStores();
  const opening = longDate(stores[0].opens);
  const apart = stores.length === 2 ? Math.round(greatCircleKm(stores[0], stores[1])) : 0;
  const cards = [SCENES.storeA, SCENES.storeB];
  return (
    <section className="first" id="first" aria-labelledby="first-title">
      <div className="first__stage" data-sp="cover">
        <div className="wrap first__in">
          <p className="eyebrow" data-r="">
            {f.eyebrow}
          </p>
          <h2 id="first-title" className="first__title" data-r="words">
            <Words text={f.title} accent />
          </h2>
          <p className="lede first__lede" data-r="">
            {fill(f.lede, { names: listOf(stores.map((s) => s.name)), opening })}
          </p>
        </div>
        <Scene kind="first" spec={SCENES.first} className="first__scene" />
      </div>
      <div className="wrap">
        <div className="stores__grid" data-rs="">
          {stores.map((st, i) => {
            const c = f.stores.find((x) => x.key === st.key);
            return (
              <article key={st.key} className={cx("store", `store--${i}`)} data-r="" data-tilt="">
                <div className="store__in">
                  <Scene kind={`store${i}`} spec={cards[i % 2]} className="store__art" />
                  <div className="store__copy">
                    {c && <p className="eyebrow">{c.area}</p>}
                    <h3 className="store__name">{st.name}</h3>
                    {c && <p className="store__line">{c.line}</p>}
                    <p className="store__opens">
                      <Icon name="calendar" size={16} /> {st.status === "open" ? f.open : fill(f.opens, { opening: longDate(st.opens) })}
                    </p>
                  </div>
                  <span className="glare" aria-hidden="true" />
                </div>
              </article>
            );
          })}
          {apart > 0 && (
            <p className="stores__apart" data-r="">
              <span className="stores__rule" aria-hidden="true" />
              <span className="stores__km">{fill(f.apart, { km: apart })}</span>
              <span className="stores__rule" aria-hidden="true" />
            </p>
          )}
        </div>
      </div>
      <div className="band" aria-hidden="true" />
    </section>
  );
}

/** Opening nationally: the map, the numbers so far, and the door to opening a store. */
function National() {
  const n = HOME.national;
  const opening = openingStores();
  const open = openStores();
  const provinces = storeProvinces();
  const next = nextOpening();
  const [day, mon] = next ? shortDay(next).split(" ") : ["", ""];
  return (
    <section className="sheet sec nation" id="national" aria-labelledby="national-title">
      <div className="wrap nation__grid">
        <div className="nation__copy">
          <Head id="national-title" eyebrow={n.eyebrow} title={n.title} intro={<OpeningLine soon={HOME.hero.kicker} open={HOME.hero.kickerOpen} />} />
          <p className="nation__body" data-r="">
            {n.body}
          </p>
          <dl className="stats stats--nation" data-rs="">
            {open.length > 0 && (
              <div className="stat" data-r="">
                <dt>{plural(open.length, n.stats.open)}</dt>
                <dd>
                  <Reel value={String(open.length)} />
                </dd>
              </div>
            )}
            {opening.length > 0 && (
              <div className="stat" data-r="">
                <dt>{plural(opening.length, n.stats.stores)}</dt>
                <dd>
                  <Reel value={String(opening.length)} />
                </dd>
              </div>
            )}
            <div className="stat" data-r="">
              <dt>{plural(provinces.length, n.stats.provinces)}</dt>
              <dd>
                <Reel value={String(provinces.length)} />
              </dd>
            </div>
            {next && (
              <div className="stat" data-r="">
                <dt>{fill(n.stats.day, { year: next.slice(0, 4) })}</dt>
                <dd>
                  <Reel value={day} /> <span className="stat__unit">{mon}</span>
                </dd>
              </div>
            )}
          </dl>
          <div className="ctas" data-r="">
            <Btn href="/franchise" kind="dark" magnetic>
              {n.cta}
            </Btn>
            <Btn href="/stores" kind="ghost">
              {n.all}
            </Btn>
          </div>
        </div>
        <div className="nation__map" data-r="scale">
          <ZaMap id="map-home" />
        </div>
      </div>
    </section>
  );
}

function Founding() {
  const f = HOME.founding;
  const v = { cap: num(FACTS.founding.cap), tier: FACTS.founding.tier, months: FACTS.founding.months };
  return (
    <section className="sec founding" id="founding" aria-labelledby="founding-title">
      <div className="wrap founding__grid">
        <div className="founding__copy">
          <Head id="founding-title" eyebrow={f.eyebrow} title={fill(f.title, v)} intro={fill(f.body, v)} />
          <ul className="ticks" data-rs="">
            {f.points.map((p) => (
              <li key={p} data-r="">
                <svg viewBox="0 0 24 24" className="tick" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m7.5 12.5 3 3 6-7" />
                </svg>
                {fill(p, v)}
              </li>
            ))}
          </ul>
          <div className="founding__cta" data-r="">
            <JoinDoor kind="btn" label={f.cta} />
            {!joinLink() && <p className="muted">{f.soon}</p>}
          </div>
        </div>
        <div className="founding__art">
          <div className="fcard" data-tilt="" data-r="scale" aria-hidden="true">
            <div className="fcard__in">
              <div className="fcard__top">
                <Mark className="fcard__mark" sails="spin" />
                <span className="fcard__brand">
                  {BRAND.name}
                  <b>{f.card.brand}</b>
                </span>
              </div>
              <div className="fcard__mid">
                <span className="fcard__label">{f.card.label}</span>
                <span className="fcard__no">
                  <small>{f.card.no}</small>
                  <Reel value="0001" />
                </span>
                <span className="fcard__of">{fill(f.card.of, v)}</span>
              </div>
              <MiniScene className="fcard__art" />
              <span className="glare" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  const shop = shopLink("/");
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    url: `${FACTS.origin}/`,
    logo: `${FACTS.origin}/press/herbal-holland-logo.png`,
    slogan: BRAND.line,
    email: EMAIL.hello,
    ...(shop ? { sameAs: [shop] } : {}),
    contactPoint: (["hello", "franchise", "press", "careers"] as const).map((k) => ({
      "@type": "ContactPoint",
      contactType: HOME.org[k],
      email: EMAIL[k],
      areaServed: "ZA",
      availableLanguage: "en",
    })),
  };
  const description = openingLine(HOME.meta.description, HOME.meta.descriptionOpen);
  return (
    <Page page="home" meta={{ path: "/", title: HOME.meta.title, description, absolute: true }} jsonLd={org}>
      <Hero />
      <Statement />
      <Brand />
      <Marquee />
      <Shelf />
      <Journey />
      <First />
      <National />
      <Founding />
    </Page>
  );
}
