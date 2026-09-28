// herbalholland.com — the home page: the windmill at sunset over the KwaZulu-Natal hills, the kinetic marquee, the
// 9,475 km story from Amsterdam, our standards, the numbers, the first two stores, Founding Members and the doors in.
import { num } from "@/lib/format";
import { BRAND, CHROME, EMAIL, HOME, fill } from "../../content";
import { FACTS, joinLink, longDate, shopLink, shortDay } from "../../facts";
import { AgeBadge, Globe, Mark, SCENES, Sails, Scene, cx } from "../art";
import { JoinDoor, Page } from "../layout";
import { Btn, Head, Icon, Index, Reel, ShopDoor, Soon, Words } from "../ui";

const opening = longDate(FACTS.opening);
const dms = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
export const coords = (p: { lat: number; lon: number }) => `${dms(p.lat, "N", "S")} · ${dms(p.lon, "E", "W")}`;

function Hero() {
  const h = HOME.hero;
  return (
    <section className="hero" data-sp="exit" aria-labelledby="hero-title">
      <Scene kind="home" spec={SCENES.home} className="hero__scene" />
      <div className="wrap hero__in">
        <p className="eyebrow hero__eyebrow">{h.eyebrow}</p>
        <h1 id="hero-title" className="hero__title rise">
          <Words text={h.title} accent />
        </h1>
        <p className="hero__kicker">{fill(h.kicker, { opening })}</p>
        <div className="hero__ctas">
          <Btn href="#founding" magnetic>
            {h.primary}
          </Btn>
          <Btn href="/about" kind="ghost">
            {h.secondary}
          </Btn>
        </div>
      </div>
      <div className="wrap hero__foot">
        <p className="hero__age">
          <AgeBadge />
          <span>{h.note}</span>
        </p>
        <a className="cue" href="#journey">
          <span className="cue__line" aria-hidden="true" />
          <span>{h.cue}</span>
        </a>
        <p className="hero__coords" aria-hidden="true">
          {coords(FACTS.places.hillcrest)}
        </p>
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
          {HOME.hero.lede.split(" ").map((w, i) => (
            <span key={i} className="sw">
              {w}{" "}
            </span>
          ))}
        </p>
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

function Journey() {
  const j = HOME.journey;
  const km = num(FACTS.km.hillcrest);
  const { amsterdam, hillcrest } = FACTS.places;
  return (
    <section className="story" id="journey" aria-labelledby="story-title" data-story="">
      <div className="story__pin">
        <div className="wrap story__grid">
          <div className="story__head">
            <p className="eyebrow">{j.eyebrow}</p>
            <h2 id="story-title" className="story__title">
              <span className="sr-only">{fill(j.sr, { km })}</span>
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
            <p className="story__lede">{j.lede}</p>
          </div>
          <div className="story__globe">
            <Globe label={fill(j.caption, { from: coords(amsterdam), to: coords(hillcrest), km })} />
          </div>
          <dl className="readout" aria-hidden="true">
            <div>
              <dt>{j.readout.lat}</dt>
              <dd data-lat="">{coords(hillcrest).split(" · ")[0]}</dd>
            </div>
            <div>
              <dt>{j.readout.lon}</dt>
              <dd data-lon="">{coords(hillcrest).split(" · ")[1]}</dd>
            </div>
            <div>
              <dt>{j.readout.dist}</dt>
              <dd>
                <span data-km="">{km}</span> {j.unit}
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
                <p className="chapter__body">{fill(c.body, { opening, apart: FACTS.kmBetweenStores })}</p>
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
      <div className="mcard" aria-hidden="true">
        <Mark className="mcard__mark" />
        <span className="mcard__k">{s.members.card}</span>
        <span className="mcard__line" />
        <span className="mcard__line mcard__line--s" />
        <span className="mcard__id">
          <Icon name="members" size={14} /> {s.members.id}
        </span>
      </div>
    ),
    adults: (
      <div className="ring18" aria-hidden="true">
        <svg viewBox="0 0 120 120" focusable="false">
          <circle cx="60" cy="60" r="54" className="ring18__dash" />
          <circle cx="60" cy="60" r="44" className="ring18__solid" />
        </svg>
        <span>18+</span>
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

function Numbers() {
  const n = HOME.numbers;
  const year = FACTS.opening.slice(0, 4);
  const [day, mon] = shortDay(FACTS.opening).split(" ");
  const value: Record<string, React.ReactNode> = {
    stores: <Reel value={String(FACTS.stores.length)} />,
    date: (
      <>
        <Reel value={day} /> <span className="stat__unit">{mon}</span>
      </>
    ),
    founding: <Reel value={num(FACTS.founding.cap)} />,
    km: <Reel value={String(FACTS.kmBetweenStores)} />,
  };
  return (
    <section className="sec numbers" aria-labelledby="numbers-title">
      <div className="wrap">
        <Head id="numbers-title" eyebrow={n.eyebrow} title={n.title} />
        <dl className="stats" data-rs="">
          {n.items.map((it) => (
            <div key={it.key} className="stat" data-r="">
              <dt>{fill(it.label, { year })}</dt>
              <dd>{value[it.key]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Stores() {
  const s = HOME.stores;
  const cards = [SCENES.storeA, SCENES.storeB];
  return (
    <section className="sec stores" aria-labelledby="stores-title">
      <div className="wrap">
        <Head id="stores-title" eyebrow={s.eyebrow} title={s.title} intro={s.intro} />
        <div className="stores__grid" data-rs="">
          {FACTS.stores.map((st, i) => {
            const c = s.items.find((x) => x.key === st.key)!;
            return (
              <article key={st.key} className={cx("store", `store--${i}`)} data-r="" data-tilt="">
                <div className="store__in">
                  <Scene kind={`store${i}`} spec={cards[i]} className="store__art" />
                  <div className="store__copy">
                    <p className="eyebrow">{c.area}</p>
                    <h3 className="store__name">{st.name}</h3>
                    <p className="store__line">{c.line}</p>
                    <p className="store__opens">
                      <Icon name="calendar" size={16} /> {fill(s.opens, { opening })}
                    </p>
                  </div>
                  <span className="glare" aria-hidden="true" />
                </div>
              </article>
            );
          })}
          <p className="stores__apart" data-r="">
            <span className="stores__rule" aria-hidden="true" />
            <span className="stores__km">{fill(s.apart, { km: FACTS.kmBetweenStores })}</span>
            <span className="stores__rule" aria-hidden="true" />
          </p>
        </div>
        <div className="stores__finder" data-r="">
          <ShopDoor path="/stores" label={s.finder} kind="btn" />
          {!shopLink("/stores") && <p className="muted">{s.finderSoon}</p>}
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
              <Scene kind="fcard" spec={SCENES.card} className="fcard__art" />
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
          <li className={cx("door", !shop && "door--soon")} data-r="">
            <DoorTop icon="shop" label={d.shop.label} soon={!shop} />
            <h3 className="door__title">{shop ? <a href={shop} className="stretch">{d.shop.title}</a> : d.shop.title}</h3>
            <p className="door__body">{shop ? fill(d.shop.bodyOnline, { shop: new URL(shop).host }) : d.shop.soon}</p>
            {shop ? <DoorCta label={d.shop.cta} /> : <Soon label={CHROME.cta.shop} className="door__soon" />}
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
            {HOME.more.items
              .filter((i) => i.key !== "franchise")
              .map((i) => (
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
  return (
    <Page page="home" meta={{ path: "/", title: HOME.meta.title, description: fill(HOME.meta.description, { opening }), absolute: true }} jsonLd={org}>
      <Hero />
      <Statement />
      <Marquee />
      <Journey />
      <Standards />
      <Numbers />
      <Stores />
      <Founding />
      <Doors />
    </Page>
  );
}
