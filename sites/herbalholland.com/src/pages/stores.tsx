// herbalholland.com/stores: the stores that are open now, then each opening day's, each in its frame (the drawn
// storefront until the owner's photograph replaces it); the store map (the provinces with a store, until there are three
// or more); the door to opening one; the store concept renders; and the early-access sign-up. And /stores/{key}: each
// store's own page (Store structured data), with only what ../../facts knows: the town, the province, its status and,
// once we have them, its address, phone and hours.
import { PROVINCES } from "@/lib/sa";
import { CHROME, HOME, STORES, fill, plural } from "../../content";
import { FACTS, longDate, openStores, openingStores, shopLink, type Store } from "../../facts";
import { EarlyAccess } from "../access";
import { cx } from "../art";
import { Page, abs, site } from "../layout";
import { ZaMap } from "../map";
import { Btn, Head, ShopNow } from "../ui";
import { OpeningLine, StorePicture, openingLine, storeStatus } from "./home";
import { PageHero } from "./parts";

/** Every store, open ones first, then by opening day. */
const allStores = () => [...openStores(), ...openingStores()];

function StoreFrame({ store, n }: { store: Store; n: number }) {
  const s = STORES;
  return (
    <li className={cx("frame", "frame--store", "frame--link", `frame--${store.status}`)} id={store.key} data-r="">
      <div className="frame__media">
        <StorePicture store={store} n={n} alt={fill(s.store.photo, { name: store.name })} />
      </div>
      <div className="frame__copy">
        <p className="frame__k">{PROVINCES[store.province]}</p>
        <h4 className="frame__t">
          <a href={`/stores/${store.key}`} className="stretch">
            {store.name}
            <span className="sr-only"> {s.card.page}</span>
          </a>
        </h4>
        <p className={cx("frame__s", `frame__s--${store.status}`)}>{storeStatus(store, s.card)}</p>
        {store.address && <p className="frame__addr">{store.address}</p>}
      </div>
    </li>
  );
}

export function StoresPage() {
  const s = STORES;
  const finder = shopLink("/stores");
  const open = openStores();
  const days = [...new Set(openingStores().map((st) => st.opens!))];
  const groups: { key: string; title: string; stores: Store[] }[] = [
    ...(open.length ? [{ key: "open", title: s.list.open, stores: open }] : []),
    ...days.map((d) => ({ key: d, title: fill(s.list.opening, { date: longDate(d) }), stores: openingStores().filter((st) => st.opens === d) })),
  ];
  let n = 0;
  const crumbs = [{ label: s.meta.title, path: "/stores" }];
  return (
    <Page page="stores" stage="dusk" meta={{ path: "/stores", title: s.meta.title, description: openingLine(s.meta.description, { weekday: false }), crumbs }}>
      <PageHero kind="stores" eyebrow={s.hero.eyebrow} title={s.hero.title} lede={<OpeningLine t={HOME.hero.line} />} crumbs={crumbs}>
        <div className="ctas">
          <ShopNow page="stores" magnetic />
        </div>
        <p className="phero__note">{s.hero.shopNote}</p>
      </PageHero>

      <section className="sheet sec" aria-labelledby="list-h">
        <div className="wrap nation__grid">
          <div>
            <h2 id="list-h" className="sr-only">
              {s.hero.title}
            </h2>
            {groups.map((g) => (
              <section key={g.key} className="prov" aria-labelledby={`grp-${g.key}`}>
                <h3 id={`grp-${g.key}`} className="prov__h" data-r="">
                  {g.title} <span>{plural(g.stores.length, s.list.count)}</span>
                </h3>
                <ul className="frames frames--list" data-rs="">
                  {g.stores.map((st) => (
                    <StoreFrame key={st.key} store={st} n={n++} />
                  ))}
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
              <p className="eyebrow">{s.more.eyebrow}</p>
              <h3 className="h3">{s.more.title}</h3>
              <p>{s.more.body}</p>
              <Btn href="/franchise" magnetic>
                {s.more.cta}
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

      <EarlyAccess />
    </Page>
  );
}

/** A store's own page. */
export function StorePage({ store }: { store: Store }) {
  const s = STORES.store;
  const t = STORES;
  const province = PROVINCES[store.province];
  const opening = store.opens ? longDate(store.opens) : "";
  const isOpen = store.status === "open";
  const status = isOpen ? s.status.open : fill(s.status.opens, { opening: longDate(store.opens!, { weekday: false }) });
  const lede = isOpen ? fill(s.lede.open, { town: store.city, province }) : fill(s.lede.opens, { town: store.city, province, opening });
  const others = allStores().filter((o) => o.key !== store.key);
  const n = allStores().findIndex((o) => o.key === store.key);
  const crumbs = [
    { label: t.meta.title, path: "/stores" },
    { label: store.name, path: `/stores/${store.key}` },
  ];
  const schema = {
    "@type": "Store",
    "@id": `${abs(`/stores/${store.key}`)}#store`,
    name: `${FACTS.brand} ${store.name}`,
    url: abs(`/stores/${store.key}`),
    brand: { "@type": "Brand", name: FACTS.brand },
    parentOrganization: { "@id": `${FACTS.origin}/#organization` },
    address: { "@type": "PostalAddress", addressLocality: store.city, addressRegion: province, addressCountry: "ZA", ...(store.address ? { streetAddress: store.address } : {}) },
    geo: { "@type": "GeoCoordinates", latitude: store.lat, longitude: store.lon },
    ...(store.phone ? { telephone: store.phone } : {}),
    ...(store.hours ? { openingHours: store.hours } : {}),
    ...(store.opens ? { openingDate: store.opens } : {}),
    ...(store.photo ? { image: abs(site.assets.stores[store.key]) } : {}),
  };
  return (
    <Page page="store" nav="stores" stage="dusk" meta={{ path: `/stores/${store.key}`, title: fill(s.meta.title, { name: store.name }), description: fill(s.meta.description, { name: store.name, province, status }), crumbs }} jsonLd={schema}>
      <PageHero kind="store" eyebrow={fill(s.eyebrow, { province })} title={store.name} lede={lede} crumbs={crumbs}>
        <div className="ctas">
          <ShopNow page="store" magnetic />
          <Btn href="/stores" kind="ghost" icon={null}>
            {s.nearby.all}
          </Btn>
        </div>
      </PageHero>

      <section className="sheet sec" aria-labelledby="visit-h">
        <div className="wrap nation__grid">
          <div className="store__page">
            <Head id="visit-h" eyebrow={s.details.title} title={storeStatus(store, { open: t.card.open, opens: t.card.opens })} />
            <figure className="frame frame--store frame--single" data-r="">
              <div className="frame__media">
                <StorePicture store={store} n={n} alt={fill(s.photo, { name: store.name })} />
              </div>
              {!store.photo && <figcaption className="sr-only">{s.art}</figcaption>}
            </figure>
            {store.address || store.phone || store.hours ? (
              <dl className="facts" data-rs="">
                {store.address && (
                  <div className="facts__row" data-r="">
                    <dt>{s.details.address}</dt>
                    <dd>{store.address}</dd>
                  </div>
                )}
                {store.phone && (
                  <div className="facts__row" data-r="">
                    <dt>{s.details.phone}</dt>
                    <dd>
                      <a className="link" href={`tel:${store.phone.replace(/[^\d+]/g, "")}`}>
                        {store.phone}
                      </a>
                    </dd>
                  </div>
                )}
                {store.hours && (
                  <div className="facts__row" data-r="">
                    <dt>{s.details.hours}</dt>
                    <dd>{store.hours.join(" · ")}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="muted store__pending" data-r="">
                {isOpen ? s.pending : s.pendingOpening}
              </p>
            )}
          </div>
          <div className="nation__map">
            <ZaMap id="map-store" here={store.key} />
            <div className="nation__side" data-r="">
              <p className="eyebrow">{fill(s.shop.title, { town: store.city })}</p>
              <h3 className="h3">{CHROME.cta.shop}</h3>
              <p>{s.shop.body}</p>
              <ShopNow page="store" />
            </div>
          </div>
        </div>
      </section>

      {others.length > 0 && (
        <section className="sec" aria-labelledby="others-h">
          <div className="wrap">
            <div className="stores__head" data-r="">
              <h2 id="others-h" className="eyebrow">
                {s.nearby.title}
              </h2>
              <a className="link" href="/stores">
                {s.nearby.all}
              </a>
            </div>
            <ul className="frames frames--stores" data-rs="">
              {others.map((o) => (
                <StoreFrame key={o.key} store={o} n={allStores().findIndex((x) => x.key === o.key)} />
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="sheet sec" aria-labelledby="own-h">
        <div className="wrap panel panel--wide" data-r="">
          <p className="eyebrow">{t.more.eyebrow}</p>
          <h2 id="own-h" className="h2 panel__title">
            {s.own.title}
          </h2>
          <p className="panel__body">{s.own.body}</p>
          <Btn href="/franchise" magnetic>
            {s.own.cta}
          </Btn>
        </div>
      </section>
    </Page>
  );
}
