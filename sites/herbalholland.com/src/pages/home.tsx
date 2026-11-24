// The herbalholland.com home page: one journey. It opens on a Dutch polder at golden hour with one windmill in the
// wind ("Holland, meet South Africa."), crosses the sea along the 9,475 km great circle, arrives in the KwaZulu-Natal
// hills as the sun drops ("Holland, meet the Hills."), passes the stores, shows what's in store as dusk deepens, and
// ends at night under the Southern Cross with Founding Members and the one early-access sign-up. The landscape is the
// Stage (../art) behind the page; each scene here is what scrolls over it, and each carries a Backdrop of its own for
// readers without motion. Every count, date, place and pin comes from the stores list in ../../facts.
import { num } from "@/lib/format";
import { PROVINCES } from "@/lib/sa";
import { ABOUT, BRAND, EMAIL, HOME, STORES, fill } from "../../content";
import { FACTS, joinLink, listOf, longDate, newStores, nextOpening, openStores, openingStores, provinceNames, storeProvinces, type Store } from "../../facts";
import { Globe, Mark, cx } from "../art";
import { JoinDoor, Page, site } from "../layout";
import { Backdrop, Plate } from "./parts";
import { Btn, Head, Icon, Index, Keep, Reel, Words } from "../ui";

const dms = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
export const coords = (p: { lat: number; lon: number }) => `${dms(p.lat, "N", "S")} · ${dms(p.lon, "E", "W")}`;

/** Towns in running text: by name, up to four ("Pietermaritzburg and Durban"), then counted by province. */
export const towns = (stores: readonly Store[]) =>
  stores.length <= 4 ? listOf(stores.map((s) => s.city)) : fill(HOME.towns, { n: num(stores.length), provinces: provinceNames(storeProvinces(stores)) });

type Line = { soon: string; both: string; open: string };
/**
 * Where we are, from the stores list: "Open now in Pietermaritzburg and Durban, and opening in Hillcrest and Hilton on
 * Tuesday 1 December 2026…", or only what's opening (before any store is open), or only what's open (once all are).
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

/** A store's picture: the owner's photograph once there is one, a store concept render until then. */
export function StorePicture({ store, n, alt }: { store: Store; n: number; alt: string }) {
  const photo = store.photo && site.assets.stores[store.key];
  return photo ? <img src={photo} alt={alt} width="800" height="600" loading="lazy" decoding="async" /> : <img src={site.assets.concept[n % site.assets.concept.length]} alt={alt} width="594" height="608" loading="lazy" decoding="async" />;
}

// ── Scene 1: the polder ──────────────────────────────────────────────────────
function Hero() {
  const h = HOME.hero;
  return (
    <section className="scene scene--hero" id="hero" data-sp="exit" data-mill="" aria-labelledby="hero-title">
      <Plate name="polder" />
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
          <Btn href="#journey" magnetic>
            {HOME.hero.story}
          </Btn>
          <Btn href="/stores" kind="ghost">
            {HOME.hero.stores}
          </Btn>
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
    <section className="scene scene--sea story" id="journey" data-scene="1" data-mill="" data-story="" aria-labelledby="story-title">
      <Backdrop name="sea" />
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
  const later = fresh.filter((st) => st.status !== "open");
  const names = (list: readonly Store[]) => listOf(list.map((st) => st.name));
  const opening = later[0]?.opens ? longDate(later[0].opens) : "";
  const text = !later.length ? f.ledeOpen : later.length === fresh.length ? f.lede : f.ledeMixed;
  const lede = fresh.length
    ? fill(text, { count: f.count[fresh.length] ?? num(fresh.length), names: names(fresh), open: names(fresh.filter((st) => st.status === "open")), later: names(later), opening })
    : undefined;
  const all = [...openStores(), ...openingStores()];
  return (
    <section className="scene scene--hills" id="hills" data-scene="2" data-mill="" aria-labelledby="hills-title">
      <Backdrop name="hills" />
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
            <li key={st.key} className={cx("frame", "frame--store", "frame--link", `frame--${st.status}`)} data-r="">
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
                <p className={cx("frame__s", `frame__s--${st.status}`)}>{storeStatus(st, { open: s.open, opens: s.opening.replace("{date}", "{opening}") })}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Scene 4: the genetics ────────────────────────────────────────────────────
function Genetics() {
  const g = HOME.genetics;
  const w = HOME.world;
  return (
    <section className="scene scene--range" id="genetics" data-scene="3" data-mill="" aria-labelledby="world-title">
      <Backdrop name="canal" />
      <div className="wrap">
        <Head id="world-title" eyebrow={w.eyebrow} title={w.title} intro={w.intro} />
        <ol className="timeline" data-rs="">
          {w.timeline.map((t) => (
            <li key={t.where} className="timeline__i" data-r="">
              <span className="eyebrow">{t.when}</span>
              <h3 className="h3 pillar__t">{t.where}</h3>
              <p className="pillar__b">{t.body}</p>
            </li>
          ))}
        </ol>
        <div className="genetics__lr">
          <h3 className="h3" data-r="">{w.landracesTitle}</h3>
          <dl className="landraces landraces--world" data-rs="">
            {w.landraces.map((l) => (
              <div key={l.name} className="landrace" data-r="">
                <dt>
                  {l.name} <span>{l.origin}</span>
                </dt>
                <dd>{l.note}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="genetics__lr">
          <div data-r="">
            <h3 className="h3">{w.modernTitle}</h3>
            <p className="muted">{w.modernIntro}</p>
          </div>
          <dl className="landraces landraces--world" data-rs="">
            {w.modern.map((l) => (
              <div key={l.name} className="landrace" data-r="">
                <dt>
                  {l.name} <span>{l.when}</span>
                </dt>
                <dd>{l.note}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="genetics__lr">
          <div data-r="">
            <h3 className="h3">{w.launchTitle}</h3>
            <p className="muted">{w.launchIntro}</p>
          </div>
          <dl className="landraces landraces--world" data-rs="">
            {w.launch.map((l) => (
              <div key={l.name} className="landrace" data-r="">
                <dt>
                  {l.name} <span>{l.when}</span>
                </dt>
                <dd>{l.note}</dd>
              </div>
            ))}
          </dl>
        </div>
        <h3 className="h3 genetics__h" data-r="">{w.typesTitle}</h3>
        <ul className="pillars" data-rs="">
          {w.types.map((t) => (
            <li key={t.key} className="pillar" data-r="">
              <h4 className="h3 pillar__t">{t.title}</h4>
              <p className="pillar__b">{t.body}</p>
            </li>
          ))}
        </ul>
        <div className="effects" data-r="">
          <h3 className="h3">{w.effectsTitle}</h3>
          {w.effects.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
        <div className="genetics__break" />
        <Head id="genetics-title" eyebrow={g.eyebrow} title={g.title} intro={g.intro} />
        <ol className="pillars" data-rs="">
          {g.pillars.map((p, i) => (
            <li key={p.key} className="pillar" data-r="">
              <Index n={i + 1} className="pillar__n" />
              <h3 className="h3 pillar__t">{p.title}</h3>
              <p className="pillar__b">{p.body}</p>
            </li>
          ))}
        </ol>
        <div className="genetics__lr">
          <blockquote className="quote" data-r="">
            <p>{ABOUT.heritage.quote}</p>
          </blockquote>
          <div>
            <h3 className="eyebrow" data-r="">{g.landracesTitle}</h3>
            <dl className="landraces" data-rs="">
              {ABOUT.heritage.landraces.map((l) => (
                <div key={l.name} className="landrace" data-r="">
                  <dt>
                    {l.name} <span>{l.origin}</span>
                  </dt>
                  <dd>{l.note}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className="range__note muted" data-r="">
          <Icon name="medicines" size={16} /> {g.note}
        </p>
      </div>
    </section>
  );
}

// ── Scene 5: night ───────────────────────────────────────────────────────────
function Night() {
  const f = HOME.founding;
  const v = { cap: num(FACTS.founding.cap), tier: FACTS.founding.tier, months: FACTS.founding.months };
  const join = joinLink();
  return (
    <section className="scene scene--night" id="night" data-scene="4" data-mill="" aria-labelledby="founding-title">
      <Backdrop name="night" />
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
                <Mark className="fcard__mark" use />
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
      </div>
    </section>
  );
}

// ── After night: the latest Instagram posts (pictures downloaded at build time; none, no section) ─
function Gram() {
  const g = HOME.gram;
  const ig = FACTS.social.find((s) => s.label === "Instagram");
  if (!site.gram.length || !ig) return null;
  const handle = `@${ig.url.replace(/\/+$/, "").split("/").pop()}`;
  return (
    <section className="gram" id="instagram" aria-labelledby="gram-title">
      <div className="wrap">
        <Head id="gram-title" eyebrow={g.eyebrow} title={g.title} intro={g.body} />
        <ul className="gram__grid" role="list">
          {site.gram.map((p) => (
            <li key={p.href} data-r="">
              <a href={p.href} rel="noopener" aria-label={fill(g.post, { date: longDate(p.day) })}>
                <img src={p.src} alt={p.alt} width={480} height={480} loading="lazy" decoding="async" />
              </a>
            </li>
          ))}
        </ul>
        <div className="gram__more" data-r="">
          <Btn href={ig.url} kind="ghost" external>
            {fill(g.follow, { handle })}
          </Btn>
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  const org = {
    "@type": "Organization",
    "@id": `${FACTS.origin}/#organization`,
    name: BRAND.name,
    url: `${FACTS.origin}/`,
    logo: `${FACTS.origin}/apple-touch-icon.png`,
    slogan: BRAND.line,
    email: EMAIL.hello,
    ...(FACTS.social.length ? { sameAs: FACTS.social.map((x) => x.url) } : {}),
    contactPoint: (["hello", "press", "careers"] as const).map((k) => ({
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
      <Genetics />
      <Night />
      <Gram />
    </Page>
  );
}
