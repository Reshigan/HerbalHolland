// Pieces shared by the inner pages: the page header (breadcrumbs, the title rising word by word over the stage, which
// holds the sky and the hills in the state the page belongs to).
import { Crumbs, site, type Crumb } from "../layout";
import { Words } from "../ui";

/** Which photographic plate each page header stands on (Higgsfield renders in static/hero: no people, no text). */
const PLATE: Record<string, string> = { about: "hills", careers: "canal", contact: "sea", press: "night", release: "night", stores: "store", store: "store", privacy: "canal", terms: "canal" };

/** The hero's photograph, behind the words and over the stage; it fades as the scene leaves so the drawn journey takes over. */
export function Plate({ name }: { name: string }) {
  const big = site.assets.hero[name];
  if (!big) return null;
  const sm = site.assets.hero[`${name}-sm`];
  return (
    <div className={`plate plate--${name}`} aria-hidden="true">
      <img src={big} srcSet={sm ? `${sm} 960w, ${big} 1344w` : undefined} sizes="100vw" alt="" width="1344" height="752" fetchPriority="high" decoding="async" />
    </div>
  );
}

export function PageHero({ kind, eyebrow, title, lede, crumbs, children }: { kind: string; eyebrow: string; title: string; lede: React.ReactNode; crumbs: readonly Crumb[]; children?: React.ReactNode }) {
  return (
    <section className={`phero phero--${kind}`} data-sp="exit" data-mill="" aria-labelledby="page-title">
      <Plate name={PLATE[kind] ?? "canal"} />
      <div className="wrap phero__in">
        <div data-in="1">
          <Crumbs crumbs={crumbs} />
        </div>
        <p className="eyebrow" data-in="1">
          {eyebrow}
        </p>
        <h1 id="page-title" className="h1 phero__title rise">
          <Words text={title} />
        </h1>
        <p className="lede" data-in="2">
          {lede}
        </p>
        {children && (
          <div className="phero__more" data-in="3">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

/** A scene's photograph (static/hero), held still behind a long scene while its words scroll over it. */
export function Backdrop({ name }: { name: string }) {
  const big = site.assets.hero[name];
  if (!big) return null;
  const sm = site.assets.hero[`${name}-sm`];
  return (
    <div className={`backdrop backdrop--${name}`} aria-hidden="true">
      <img src={big} srcSet={sm ? `${sm} 960w, ${big} 1344w` : undefined} sizes="100vw" alt="" width="1344" height="752" loading="lazy" decoding="async" />
    </div>
  );
}
