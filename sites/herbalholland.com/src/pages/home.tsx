// herbalholland.com — the home page: one journey. It opens on a Dutch polder at golden hour with one windmill in the
// wind ("Holland, meet South Africa."), crosses the sea along the 9,475 km great circle, arrives in the KwaZulu-Natal
// hills as the sun drops ("Holland, meet the Hills."), passes the stores, shows what's in store as dusk deepens, and
// ends at night under the Southern Cross with Founding Members and the one early-access sign-up. The landscape is the
// Stage (../art) behind the page; each scene here is what scrolls over it, and each carries a Still of its own for
// readers without motion. Every count, date, place and pin comes from the stores list in ../../facts.
import { num } from "@/lib/format";
import { PROVINCES } from "@/lib/sa";
import { BRAND, CHROME, EMAIL, HOME, STORES, fill } from "../../content";
import { FACTS, joinLink, listOf, longDate, newStores, nextOpening, openStores, openingStores, provinceNames, shopLink, storeProvinces, type Store } from "../../facts";
import { EarlyAccess } from "../access";
import { CatArt, Globe, Mark, Sails, Still, Storefront, cx } from "../art";
import { JoinDoor, Page, site } from "../layout";
import { Head, Icon, Index, Keep, Reel, ShopNow, Words } from "../ui";

const dms = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
export const coords = (p: { lat: number; lon: number }) => `${dms(p.lat, "N", "S")} · ${dms(p.lon, "E", "W")}`;

/** Towns in running text: by name, up to four ("Pietermaritzburg and Umhlanga"), then counted by province. */
export const towns = (stores: readonly Store[]) =>
  stores.length <= 4 ? listOf(stores.map((s) => s.city)) : fill(HOME.towns, { n: num(stores.length), provinces: provinceNames(storeProvinces(stores)) });

type Line = { soon: string; both: string; open: string };
/**
 * Where we are, from the stores list: "Open now in Pietermaritzburg and Umhlanga, and opening in Hillcrest and Hilton on
 * Tuesday 1 December 2026…" — or only what's opening (before any store is open), or only what's open (once all are).
 */
export function openingLine(t: Line, { weekday = true } = {}) {
  const open = openStores();
  const next = nextOpening();
  const coming = openingStores().filter((s) => s.opens === next);
  const v = { open: towns(open), next: towns(coming), opening: next ? longDate(next, { weekday }) : "" };
  return fill(!next ? t.open : open.length ? t.both : t.soon, v);
}

/** The same line for the page, with place names kept whole across line breaks. */
export const OpeningLine = ({ t }: { t: Line }) => <Keep text={openingLine(t)} names={[...Object.values(PROVINCES), ...FACTS.stores.map((s) => s.city)]} />;

/** A store's status line: "Open now" or "Opening Tuesday 1 December 2026". */
export const storeStatus = (s: Store, t: { open: string; opens: string }) => (s.status === "open" || !s.opens ? t.open : fill(t.opens, { opening: longDate(s.opens) }));

/** A store's picture: the owner's photograph once there is one, the drawn storefront until then. */
export function StorePicture({ store, n, alt }: { store: Store; n: number; alt: string }) {
  const photo = store.photo && site.assets.stores[store.key];
  return photo ? <img src={photo} alt={alt} width="800" height="600" loading="lazy" decoding="async" /> : <Storefront n={n} />;
}

// ── Scene 1: the polder ──────────────────────────────────────────────────────
function Hero() {
  const h = HOME.hero;
  return (
    <section className="scene scene--hero" id="hero" data-sp="exit" aria-labelledby="hero-title">
      <div className="wrap hero__in">
        <p className="eyebrow" data-in="1">
          {h.eyebrow}
        </p>
        <h1 id="hero-title" className="hero__title rise">
          <Words text={h.title} accent />
        </h1>
        <p className="hero__kicker" data-in="2">
          <span>
            <OpeningLine t={h.line} />
          </span>
        </p>
        <div className="ctas" data-in="3">
          <ShopNow page="home" magnetic />
        </div>
      </div>
      <p className="cue" data-in="4" aria-hidden="true">
        <span>{h.cue}</span>
        <i />
      </p>
    </section>
  );
}

// ── Scene 2: across the sea ──────────────────────────────────────────────────
/** The readout's distance: an unseen copy of the final value holds its width, so the readout never moves. */
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

/** The 9,475 km story: pinned while the windmill flies the arc from Amsterdam to the hills (the first of the new stores). */
function Journey() {
  const j = HOME.journey;
  const first = newStores()[0] ?? FACTS.stores[0];
  const km = num(FACTS.km[first.key] ?? 0);
  const here = coords(first).split(" · ");
  return (
    <section className="scene scene--sea story" id="journey" data-scene="1" aria-labelledby="story-title" data-story="">
      <Still kind="sea" />
      <div className="story__pin">
        <div className="wrap story__grid">
          <div className="story__head">
            <p className="eyebrow">{j.eyebrow}</p>
            <h2 id="story-title" className="story__title">
              <span className="sr-only">{fill(j.sr, { km, city: first.city })}</span>
              <span className="story__big" aria-hidden="true">
                <span className="story__km" data-km-big="">
                  {km}
                </span>
                <span className="story__unit">{j.unit}</span>
              </span>
              <span className="story__sub" aria-hidden="true">
                {j.title}
              </span>
            </h2>
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
                <p className="chapter__body">{c.key === "welcome" ? <OpeningLine t={HOME.hero.line} /> : c.body}</p>
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

// ── Scene 3: the hills, and the stores ───────────────────────────────────────
function Hills() {
  const f = HOME.hills;
  const s = HOME.stores;
  const fresh = newStores();
  const opening = fresh[0]?.opens ? longDate(fresh[0].opens) : "";
  const lede = fresh.length
    ? fill(fresh.every((st) => st.status === "open") ? f.ledeOpen : f.lede, { count: f.count[fresh.length] ?? num(fresh.length), names: listOf(fresh.map((st) => st.name)), opening })
    : undefined;
  const all = [...openStores(), ...openingStores()];
  const shop = shopLink("/");
  return (
    <section className="scene scene--hills" id="hills" data-scene="2" aria-labelledby="hills-title">
      <Still kind="dusk" />
      <div className="wrap hills__in">
        <Head id="hills-title" eyebrow={f.eyebrow} title={<Words text={f.title} accent />} intro={lede && <Keep text={lede} names={FACTS.stores.map((st) => st.name)} />} />
      </div>
      <div className="wrap stores" aria-labelledby="stores-h">
        <div className="stores__head" data-r="">
          <h3 id="stores-h" className="eyebrow">
            {s.eyebrow}
          </h3>
          <a className="link" href="/stores">
            {s.all}
          </a>
        </div>
        <ul className="frames frames--stores" data-rs="">
          {all.map((st, i) => (
            <li key={st.key} className={cx("frame", "frame--store", `frame--${st.status}`)} data-r="">
              <div className="frame__media">
                <StorePicture store={st} n={i} alt={fill(STORES.store.photo, { name: st.name })} />
              </div>
              <div className="frame__copy">
                <p className="frame__k">{PROVINCES[st.province]}</p>
                <h4 className="frame__t">
                  <a href={`/stores/${st.key}`} className="stretch">
                    {st.name}
                    <span className="sr-only"> {s.page}</span>
                  </a>
                </h4>
                <p className="frame__s">
                  <Icon name={st.status === "open" ? "open" : "calendar"} size={15} /> {storeStatus(st, { open: s.open, opens: s.opening.replace("{date}", "{opening}") })}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="stores__foot" data-r="">
          <p className="stores__more">
            {s.more}{" "}
            <a className="link" href="/franchise">
              {s.own}
            </a>
          </p>
          <p className="stores__shop muted">
            {s.shop}{" "}
            <a className="link" href={shop ?? "#first-access"}>
              {shop ? CHROME.cta.shop : CHROME.cta.access}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Scene 4: what's in store ─────────────────────────────────────────────────
function Range() {
  const r = HOME.range;
  return (
    <section className="scene scene--range" id="range" data-scene="3" aria-labelledby="range-title">
      <Still kind="late" />
      <div className="wrap">
        <Head id="range-title" eyebrow={r.eyebrow} title={r.title} intro={r.intro} />
        <ul className="frames frames--cats" data-rs="">
          {r.items.map((it) => {
            const live = shopLink(FACTS.shelf[it.key] ?? "/shop");
            return (
              <li key={it.key} className="frame frame--cat" data-r="">
                <div className="frame__media">
                  <CatArt kind={it.key} />
                </div>
                <div className="frame__copy">
                  <h3 className="frame__t">{it.title}</h3>
                  <p className="frame__s">{it.body}</p>
                  <a className="frame__go stretch" href={live ?? "#first-access"}>
                    {r.shop}
                    <span className="sr-only"> {it.title}</span>
                    <Icon name={live ? "out" : "arrow"} size={16} />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="range__note muted" data-r="">
          <Icon name="medicines" size={16} /> {r.note}
        </p>
      </div>
    </section>
  );
}

/** Between dusk and night: what we stand for, in five words, drifting with the scroll. */
function Marquee() {
  const words = HOME.marquee.words;
  return (
    <div className="marquee" aria-label={HOME.marquee.label} data-marquee="" role="region">
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
    </div>
  );
}

// ── Scene 5: night ───────────────────────────────────────────────────────────
function Night() {
  const f = HOME.founding;
  const v = { cap: num(FACTS.founding.cap), tier: FACTS.founding.tier, months: FACTS.founding.months };
  const join = joinLink();
  return (
    <section className="scene scene--night" id="night" data-scene="4" aria-labelledby="founding-title">
      <Still kind="night" />
      <div className="wrap night__in">
        <div className="night__copy">
          <Head id="founding-title" eyebrow={f.eyebrow} title={fill(f.title, v)} intro={fill(f.body, v)} />
          <div className="night__join" data-r="">
            {join ? (
              <JoinDoor kind="btn" label={f.cta} />
            ) : (
              <p className="muted">{f.soon}</p>
            )}
          </div>
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
              <span className="fcard__beads" />
              <span className="glare" />
            </div>
          </div>
        </div>
        <EarlyAccess box />
      </div>
    </section>
  );
}

export function HomePage() {
  const shop = shopLink("/");
  const org = {
    "@type": "Organization",
    "@id": `${FACTS.origin}/#organization`,
    name: BRAND.name,
    url: `${FACTS.origin}/`,
    logo: `${FACTS.origin}/press/herbal-holland-logo.png`,
    slogan: BRAND.line,
    email: EMAIL.hello,
    ...(FACTS.social.length || shop ? { sameAs: [...FACTS.social, ...(shop ? [shop] : [])] } : {}),
    contactPoint: (["hello", "franchise", "press", "careers"] as const).map((k) => ({
      "@type": "ContactPoint",
      contactType: HOME.org[k],
      email: EMAIL[k],
      areaServed: "ZA",
      availableLanguage: "en",
    })),
  };
  const website = {
    "@type": "WebSite",
    "@id": `${FACTS.origin}/#website`,
    name: BRAND.name,
    url: `${FACTS.origin}/`,
    inLanguage: "en-ZA",
    publisher: { "@id": org["@id"] },
  };
  const description = openingLine(HOME.meta.description, { weekday: false });
  return (
    <Page page="home" meta={{ path: "/", title: HOME.meta.title, description, absolute: true }} jsonLd={[org, website]}>
      <Hero />
      <Journey />
      <Hills />
      <Range />
      <Marquee />
      <Night />
    </Page>
  );
}
