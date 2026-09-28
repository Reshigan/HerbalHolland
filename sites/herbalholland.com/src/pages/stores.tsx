// herbalholland.com/stores — the stores that are open now, then each opening day's; the national map; the store
// concept (the owner's two renders, cropped to the storefront); the door to opening one; and the early-access sign-up
// for the online shop, which delivers wherever there's no store yet. All from the stores list in ../../facts, and only
// what we know: an open store shows its town, and the online shop's store finder (hours and directions) once it's live.
import { PROVINCES } from "@/lib/sa";
import { HOME, STORES, fill, plural } from "../../content";
import { longDate, openStores, openingStores, shopLink, type Store } from "../../facts";
import { EarlyAccess } from "../access";
import { SCENES, Scene, cx } from "../art";
import { Page, site } from "../layout";
import { ZaMap } from "../map";
import { Btn, Head, Icon, ShopNow } from "../ui";
import { OpeningLine, openingLine } from "./home";
import { PageHero } from "./parts";

export function StoresPage() {
  const s = STORES;
  const finder = shopLink("/stores");
  const cards = [SCENES.storeA, SCENES.storeB];
  // Open now first, then each opening day, soonest first.
  const open = openStores();
  const days = [...new Set(openingStores().map((st) => st.opens!))];
  const groups: { key: string; title: string; stores: Store[] }[] = [
    ...(open.length ? [{ key: "open", title: s.list.open, stores: open }] : []),
    ...days.map((d) => ({ key: d, title: fill(s.list.opening, { date: longDate(d) }), stores: openingStores().filter((st) => st.opens === d) })),
  ];
  let n = 0;
  return (
    <Page page="stores" meta={{ path: "/stores", title: s.meta.title, description: `${s.meta.description} ${openingLine(HOME.hero.line)}` }}>
      <PageHero kind="stores" eyebrow={s.hero.eyebrow} title={s.hero.title} lede={<OpeningLine t={HOME.hero.line} />}>
        <div className="ctas">
          <ShopNow page="stores" magnetic />
        </div>
        <p className="phero__note">{s.hero.shopNote}</p>
      </PageHero>

      <section className="sheet sec" aria-labelledby="list-h">
        <div className="wrap nation__grid">
          <div>
            <Head id="list-h" eyebrow={s.list.eyebrow} title={s.list.title} />
            {groups.map((g) => (
              <section key={g.key} className="prov" aria-labelledby={`grp-${g.key}`}>
                <h3 id={`grp-${g.key}`} className="prov__h" data-r="">
                  {g.title} <span>{plural(g.stores.length, s.list.count)}</span>
                </h3>
                <ul className="prov__list" data-rs="">
                  {g.stores.map((st) => {
                    const i = n++;
                    return (
                      <li key={st.key} id={st.key} className={cx("store", `store--${st.status}`)} data-r="" data-tilt="">
                        <div className="store__in">
                          <Scene kind={`store${i}`} spec={cards[i % 2]} className="store__art" />
                          <div className="store__copy">
                            <p className="eyebrow">{PROVINCES[st.province]}</p>
                            <h4 className="store__name">{st.name}</h4>
                            <p className="store__opens">
                              <Icon name={st.status === "open" ? "open" : "calendar"} size={16} />{" "}
                              {st.status === "open" || !st.opens ? s.card.open : fill(s.card.opens, { opening: longDate(st.opens) })}
                            </p>
                            {st.status === "open" && (
                              <p className="store__visit">
                                {fill(s.card.visit, { town: st.city })}{" "}
                                {finder && (
                                  <a className="link" href={finder}>
                                    {s.card.finder}
                                  </a>
                                )}
                              </p>
                            )}
                            <p className="store__owned">{s.card.owned}</p>
                          </div>
                          <span className="glare" aria-hidden="true" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {finder && (
              <div className="note stc__finder" data-r="">
                <h3 className="h3">{s.finder.title}</h3>
                <p>{s.finder.body}</p>
                <Btn href={finder} kind="dark" icon="out">
                  {s.finder.cta}
                </Btn>
              </div>
            )}
          </div>
          <div className="nation__map">
            <ZaMap id="map-stores" />
            <div className="nation__side" data-r="">
              <p className="eyebrow">{s.map.eyebrow}</p>
              <h3 className="h3">{s.map.title}</h3>
              <p>{s.map.body}</p>
              <Btn href="/franchise" magnetic>
                {s.map.cta}
              </Btn>
            </div>
          </div>
        </div>
      </section>

      <section className="sec concept" aria-labelledby="concept-h">
        <div className="wrap">
          <Head id="concept-h" eyebrow={s.concept.eyebrow} title={s.concept.title} intro={s.concept.body} />
          <div className="concept__grid" data-rs="">
            {site.assets.concept.map((src, i) => (
              <figure key={src} className="concept__fig" data-r="">
                <img src={src} width="594" height="608" alt={s.concept.items[i]} loading="lazy" decoding="async" />
                <figcaption>
                  <b>{s.concept.label}</b> {s.concept.note}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <EarlyAccess tone="sheet" />
    </Page>
  );
}
