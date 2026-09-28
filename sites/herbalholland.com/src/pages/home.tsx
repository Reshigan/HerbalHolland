// herbalholland.com — the home page: the windmill at sunset over the hills ("Holland, meet South Africa."), with
// "Shop online" first and the promise bar beneath it; what we are; what's in store, a "Shop" on every category; the
// early-access sign-up; the kinetic marquee; the 9,475 km story from Amsterdam; our standards; the first chapter in
// numbers; the first stores ("Holland, meet the Hills."); the map as stores open across the country; Founding Members;
// and the doors in. Every count, date, place and pin comes from the stores list in ../../facts, and every way to shop
// leads to the online shop once it's live, or to the early-access sign-up until then.
import { num } from "@/lib/format";
import { PROVINCES } from "@/lib/sa";
import { BRAND, CHROME, EMAIL, HOME, fill } from "../../content";
import { FACTS, firstStores, greatCircleKm, joinLink, listOf, longDate, nextOpening, openStores, openingStores, provinceNames, shopLink, shortDay, storeProvinces } from "../../facts";
import { EarlyAccess } from "../access";
import { AgeBadge, Globe, Mark, MiniScene, SCENES, Sails, Scene, cx } from "../art";
import { JoinDoor, Page } from "../layout";
import { ZaMap } from "../map";
import { Btn, Head, Icon, Index, Keep, Reel, ShopNow, Soon, Words } from "../ui";

const dms = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
export const coords = (p: { lat: number; lon: number }) => `${dms(p.lat, "N", "S")} · ${dms(p.lon, "E", "W")}`;

/** "Our first stores open in KwaZulu-Natal on Tuesday 1 December 2026…", or, once a store is open, where stores are. */
export function openingLine(soon: string, open: string) {
  const next = nextOpening();
  // Before the first opening day: where and when. From then on: where stores are open (the next ones show on /stores).
  const trading = openStores();
  if (trading.length || !next) return fill(open, { provinces: provinceNames(storeProvinces(trading.length ? trading : undefined)) });
  return fill(soon, { provinces: provinceNames(storeProvinces(openingStores())), opening: longDate(next) });
}

/** The same line for the page, with province names kept whole across line breaks. */
export const OpeningLine = ({ soon, open }: { soon: string; open: string }) => <Keep text={openingLine(soon, open)} names={Object.values(PROVINCES)} />;

function Hero() {
  const h = HOME.hero;
  const p = HOME.promise;
  return (
    <section className="hero" data-sp="exit" aria-labelledby="hero-title">
      <Scene kind="home" spec={SCENES.home} className="hero__scene" />
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
          <ShopNow page="home" magnetic />
          <Btn href="/stores" kind="ghost">
            {h.secondary}
          </Btn>
        </div>
      </div>
      {/* The promise bar: what shopping with us comes with, where the hero meets the page. */}
      <div className="hero__foot" data-in="4">
        <ul className="wrap promise" aria-label={p.label}>
          {p.items.map((it) => (
            <li key={it.key} className="promise__item">
              {it.key === "adults" ? <AgeBadge /> : <Icon name={it.key === "members" ? "rewards" : it.key} className="promise__ico" />}
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** What we are, in one sentence, big: each word lights up as it's read on the way down. */
function Statement() {
  return (
    <section className="statement" data-sp="center">
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

/** What's in store: a tile per category, each with its "Shop"; the online shop's tile last. Categories only. */
function Range() {
  const r = HOME.range;
  const shop = shopLink("/");
  return (
    <section className="sheet sec range" id="range" aria-labelledby="range-title">
      <div className="wrap">
        <div className="split">
          <Head id="range-title" eyebrow={r.eyebrow} title={r.title} intro={r.intro} />
          <p className="range__note muted" data-r="">
            <Icon name="medicines" size={16} /> {r.note}
          </p>
        </div>
        <ul className="tiles" data-rs="">
          {r.items.map((it, i) => {
            const live = shopLink(FACTS.shelf[it.key] ?? "/shop");
            return (
              <li key={it.key} className="tile tile--cat" data-r="">
                <Index n={i + 1} />
                <h3 className="tile__t">{it.title}</h3>
                <p className="tile__b">{it.body}</p>
                <a className="tile__go stretch" href={live ?? "#first-access"}>
                  {r.shop}
                  <span className="sr-only"> {it.title}</span>
                  <Icon name={live ? "out" : "arrow"} size={18} />
                </a>
              </li>
            );
          })}
          <li className="tile tile--online" data-r="">
            <span className="door__ico">
              <Icon name="shop" />
            </span>
            <h3 className="tile__t">{r.online.title}</h3>
            <p className="tile__b">{shop ? r.online.body : r.online.soon}</p>
            <a className="tile__go stretch" href={shop ?? "#first-access"}>
              {shop ? r.online.cta : CHROME.cta.access}
              <Icon name={shop ? "out" : "arrow"} size={18} />
            </a>
          </li>
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

function Standards() {
  const s = HOME.standards;
  const visual: Record<string, React.ReactNode> = {
    lab: (
      <div className="lab" aria-hidden="true">
        <span className="lab__k">
          {s.demo.label} <em>{s.demo.example}</em>
        </span>
        <span className="lab__code">
          <span data-type="">{s.demo.code}</span>
          <span className="caret" />
        </span>
        <span className="lab__ok">
          <svg viewBox="0 0 24 24" className="tick" focusable="false">
            <circle cx="12" cy="12" r="10" />
            <path d="m7.5 12.5 3 3 6-7" />
          </svg>
          {s.demo.check}
        </span>
      </div>
    ),
    members: (
      <div className="rx" aria-hidden="true">
        <Icon name="members" size={30} />
        <span>{s.members.id}</span>
      </div>
    ),
    adults: (
      <div className="rx" aria-hidden="true">
        <AgeBadge />
      </div>
    ),
    medicines: (
      <div className="rx" aria-hidden="true">
        <Icon name="medicines" size={30} />
        <span>{s.pharmacist}</span>
      </div>
    ),
  };
  return (
    <section className="sheet sec standards" aria-labelledby="standards-title">
      <div className="wrap">
        <div className="split">
          <Head id="standards-title" eyebrow={s.eyebrow} title={s.title} intro={s.intro} />
          <div className="split__end" data-r="">
            <Btn href="/about" kind="dark">
              {s.cta}
            </Btn>
          </div>
        </div>
        <ul className="cards" data-rs="">
          {s.items.map((it, i) => (
            <li key={it.key} className={cx("card", `card--${it.key}`)} data-tilt="" data-r="">
              <div className="card__in">
                <div className="card__top">
                  <Index n={i + 1} />
                  {it.key === "adults" ? <AgeBadge /> : <Icon name={it.key} className="card__ico" />}
                </div>
                <div className="card__vis">{visual[it.key]}</div>
                <h3 className="card__title">{it.title}</h3>
                <p className="card__body">{it.body}</p>
                <span className="glare" aria-hidden="true" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The first opening day, in numbers: its stores, the day, the Founding Members places and how far apart they are. */
function Numbers() {
  const n = HOME.numbers;
  const stores = firstStores();
  const day0 = stores[0].opens;
  const done = stores.every((s) => s.status === "open");
  const [day, mon] = shortDay(day0).split(" ");
  const apart = stores.length >= 2 ? Math.round(greatCircleKm(stores[0], stores[1])) : 0;
  const provinces = provinceNames(storeProvinces(stores));
  const value: Record<string, React.ReactNode> = {
    stores: <Reel value={String(stores.length)} />,
    date: (
      <>
        <Reel value={day} /> <span className="stat__unit">{mon}</span>
      </>
    ),
    founding: <Reel value={num(FACTS.founding.cap)} />,
    km: <Reel value={String(apart)} />,
  };
  const label = (it: (typeof n.items)[number]) => fill(done && "done" in it ? it.done : it.label, { provinces, year: day0.slice(0, 4), a: stores[0].name, b: stores[1]?.name ?? "" });
  return (
    <section className="sec numbers" aria-labelledby="numbers-title">
      <div className="wrap">
        <Head id="numbers-title" eyebrow={n.eyebrow} title={fill(n.title, { count: n.count[stores.length] ?? num(stores.length) })} />
        <dl className="stats" data-rs="">
          {n.items
            .filter((it) => it.key !== "km" || apart > 0)
            .map((it) => (
              <div key={it.key} className="stat" data-r="">
                <dt>{label(it)}</dt>
                <dd>{value[it.key]}</dd>
              </div>
            ))}
        </dl>
      </div>
    </section>
  );
}

/** The first chapter: Holland, meet the Hills. A card for each first store, how far apart they are, and all stores. */
function First() {
  const f = HOME.first;
  const stores = firstStores();
  const opening = longDate(stores[0].opens);
  const apart = stores.length === 2 ? Math.round(greatCircleKm(stores[0], stores[1])) : 0;
  const cards = [SCENES.storeA, SCENES.storeB];
  const lede = fill(stores.every((s) => s.status === "open") ? f.ledeOpen : f.lede, { names: listOf(stores.map((s) => s.name)), opening });
  return (
    <section className="sec stores" id="first" aria-labelledby="first-title">
      <div className="wrap">
        <Head id="first-title" eyebrow={f.eyebrow} title={<Words text={f.title} accent />} intro={lede} />
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
        <div className="stores__finder" data-r="">
          <Btn href="/stores" kind="ghost">
            {f.all}
          </Btn>
        </div>
      </div>
    </section>
  );
}

/** Opening nationally: the map, and the door to opening a store. */
function National() {
  const n = HOME.national;
  return (
    <section className="sheet sec nation" id="national" aria-labelledby="national-title">
      <div className="wrap nation__grid">
        <div className="nation__copy">
          <Head id="national-title" eyebrow={n.eyebrow} title={n.title} intro={<OpeningLine soon={HOME.hero.kicker} open={HOME.hero.kickerOpen} />} />
          <p className="nation__body" data-r="">
            {n.body}
          </p>
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
  const join = joinLink();
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
            {join ? (
              <JoinDoor kind="btn" label={f.cta} />
            ) : (
              <>
                {/* Until Rewards opens, the early-access list is the way in. */}
                <Btn href="#first-access" magnetic>
                  {CHROME.cta.access}
                </Btn>
                <p className="muted">{f.soon}</p>
              </>
            )}
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

function Doors() {
  const d = HOME.doors;
  const shop = shopLink("/");
  const join = joinLink();
  return (
    <section className="sheet sec doors" aria-labelledby="doors-title">
      <div className="wrap">
        <Head id="doors-title" eyebrow={d.eyebrow} title={d.title} />
        <ul className="doors__grid" data-rs="">
          {/* Shop: the online shop once it's live, the early-access sign-up until then. */}
          <li className="door" data-r="">
            <DoorTop icon="shop" label={d.shop.label} />
            <h3 className="door__title">
              <a href={shop ?? "#first-access"} className="stretch">
                {d.shop.title}
              </a>
            </h3>
            <p className="door__body">{shop ? fill(d.shop.body, { shop: new URL(shop).host }) : d.shop.soon}</p>
            <DoorCta label={shop ? d.shop.cta : CHROME.cta.access} />
          </li>
          <li className={cx("door", !join && "door--soon")} data-r="">
            <DoorTop icon="join" label={d.join.label} soon={!join} />
            <h3 className="door__title">{join ? <a href={join} className="stretch">{d.join.title}</a> : d.join.title}</h3>
            <p className="door__body">{join ? d.join.body : d.join.soon}</p>
            {join ? <DoorCta label={d.join.cta} /> : <Soon label={CHROME.cta.join} className="door__soon" />}
          </li>
          <li className="door door--go" data-r="">
            <DoorTop icon="franchise" label={d.franchise.label} />
            <h3 className="door__title">
              <a href="/franchise" className="stretch">
                {d.franchise.title}
              </a>
            </h3>
            <p className="door__body">{d.franchise.body}</p>
            <DoorCta label={d.franchise.cta} />
          </li>
        </ul>
        <div className="more">
          <p className="eyebrow" data-r="">
            {HOME.more.eyebrow}
          </p>
          <ul className="more__list" data-rs="">
            {HOME.more.items.map((i) => (
              <li key={i.key} data-r="">
                <a href={`/${i.key}`} className="more__link">
                  <span className="more__t">{i.title}</span>
                  <span className="more__b">{i.body}</span>
                  <span className="more__go" aria-hidden="true">
                    <Icon name="arrow" size={28} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function DoorTop({ icon, label, soon }: { icon: string; label: string; soon?: boolean }) {
  return (
    <div className="door__top">
      <span className="door__ico">
        <Icon name={icon} />
      </span>
      <span className="door__label">{label}</span>
      {soon && <span className="sr-only">{CHROME.soonSr}</span>}
    </div>
  );
}

const DoorCta = ({ label }: { label: string }) => (
  <span className="door__cta" aria-hidden="true">
    {label} <Icon name="arrow" size={18} />
  </span>
);

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
      <Range />
      <EarlyAccess />
      <Marquee />
      <Journey />
      <Standards />
      <Numbers />
      <First />
      <National />
      <Founding />
      <Doors />
    </Page>
  );
}
