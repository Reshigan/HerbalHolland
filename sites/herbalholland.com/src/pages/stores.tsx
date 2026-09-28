// herbalholland.com/stores — every store by province with its status, the national map, the store concept (the
// owner's two renders, cropped to the storefront), the door to opening one, and the early-access sign-up for the online
// shop, which delivers wherever there's no store yet. All from the stores list in ../../facts; the online shop's store
// finder (hours and directions) appears here once the shop is live.
import { PROVINCES } from "@/lib/sa";
import { STORES, fill, plural } from "../../content";
import { FACTS, longDate, shopLink, storeProvinces } from "../../facts";
import { EarlyAccess } from "../access";
import { SCENES, Scene } from "../art";
import { Page, site } from "../layout";
import { ZaMap } from "../map";
import { Btn, Head, Icon, ShopNow } from "../ui";
import { OpeningLine, openingLine } from "./home";
import { PageHero } from "./parts";

export function StoresPage() {
  const s = STORES;
  const finder = shopLink("/stores");
  const cards = [SCENES.storeA, SCENES.storeB];
  let n = 0;
  return (
    <Page page="stores" meta={{ path: "/stores", title: s.meta.title, description: openingLine(s.meta.description, s.hero.ledeOpen) }}>
      <PageHero kind="stores" eyebrow={s.hero.eyebrow} title={s.hero.title} lede={<OpeningLine soon={s.hero.lede} open={s.hero.ledeOpen} />}>
        <div className="ctas">
          <ShopNow page="stores" magnetic />
        </div>
        <p className="phero__note">{s.hero.shopNote}</p>
      </PageHero>

      <section className="sheet sec" aria-labelledby="list-h">
        <div className="wrap nation__grid">
          <div>
            <Head id="list-h" eyebrow={s.list.eyebrow} title={s.list.title} />
            {storeProvinces().map((p) => {
              const here = FACTS.stores.filter((st) => st.province === p);
              return (
                <section key={p} className="prov" aria-labelledby={`prov-${p}`}>
                  <h3 id={`prov-${p}`} className="prov__h" data-r="">
                    {PROVINCES[p]} <span>{plural(here.length, s.list.count)}</span>
                  </h3>
                  <ul className="prov__list" data-rs="">
                    {here.map((st) => {
                      const i = n++;
                      return (
                        <li key={st.key} id={st.key} className="store" data-r="" data-tilt="">
                          <div className="store__in">
                            <Scene kind={`store${i}`} spec={cards[i % 2]} className="store__art" />
                            <div className="store__copy">
                              <p className="eyebrow">{`${st.city} · ${PROVINCES[st.province]}`}</p>
                              <h4 className="store__name">{st.name}</h4>
                              <p className="store__opens">
                                <Icon name="calendar" size={16} /> {st.status === "open" ? s.card.open : fill(s.card.opens, { opening: longDate(st.opens) })}
                              </p>
                              <p className="store__owned">{s.card.owned}</p>
                            </div>
                            <span className="glare" aria-hidden="true" />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
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
