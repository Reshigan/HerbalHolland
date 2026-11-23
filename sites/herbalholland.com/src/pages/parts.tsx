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
      <Horizon />
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
      <i className="backdrop__light" />
    </div>
  );
}

// The two homes on one skyline, drawn as layered silhouettes along the foot of a hero photograph: a hazy Table Mountain
// far off; canal-house gables, a windmill, an acacia and a baobab in the middle distance; tulips and proteas in front.
// Each layer drifts at its own pace as the scene leaves (--p), the sails turn and the flowers sway (motion only).
const gable = (x: number, w: number, h: number) => {
  const s = w / 6;
  return `M${x} 262V${262 - h}h${s}v-7h${s}v-7h${s}v-8h${s}v8h${s}v7h${s}v7V262Z`;
};
const HOUSES = [gable(548, 30, 44), gable(578, 26, 52), gable(604, 32, 40), gable(636, 24, 56), gable(660, 30, 46), gable(690, 26, 38)].join("");
const TULIPS = Array.from({ length: 66 }, (_, i) => {
  const x = 6 + i * 22 + ((i * 7) % 5);
  const h = 22 + ((i * 13) % 12);
  return `M${x} 314v-${h}h2v${h}ZM${x + 2} 306q8-4 9-16q-7 6-9 9ZM${x - 4.5} ${314 - h}q1-9 2.5-12l3 5 2-7 2 7 3-5q1.5 3 2.5 12q-3 5-7.5 5t-7.5-5Z`;
}).join("");
const protea = (x: number, y: number) => `M${x} 316v-${316 - y}h2v${316 - y}ZM${x - 7} ${y + 2}q8 -22 16 0q-8 5 -16 0Z`;

export function Horizon() {
  return (
    <div className="hz">
      <i className="hz__sun" />
      <i className="hz__motes" />
      <svg className="hz__art" viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" focusable="false">
        <path className="hz__far" d="M0 320V214c60-4 110-18 150-44 20-12 40-10 55 6 25 20 65 24 115 14l60-40 40-32 440-6 40 8 40 30 40-10 30-22 30 12 60 46c100 24 220 20 340 30v114Z" />
        <g className="hz__mid">
          <path d="M0 320V268c160-10 320-6 480-8 220-2 420 4 620 0 120-2 240 2 340 6v54Z" />
          <path d={HOUSES} />
          <path d="M287 262l3-24-14-8 2-2 13 7 1-7h3l1 7 13-7 2 2-14 8 3 24ZM232 232q56-18 120 0q-6 6-22 6h-76q-16 0-22-6Z" />
          <path d="M1218 262q-8-32 3-58h30q11 26 3 58ZM1221 206l-16-20 4-2 13 15v-12l-7-11 4-2 6 10 2-14h4l1 14 2-14h4l2 14 6-10 4 2-7 11v12l13-15 4 2-16 20Z" />
          <path d="M868 262l7-58h18l7 58ZM872 204l12-12 12 12Z" />
          <g className="hz__sails">
            <path d="M883 191h2v-56h-2ZM883 193h2v56h-2ZM883 191v2h-56v-2ZM885 191v2h56v-2ZM886 140h10v44h-10ZM872 198h10v44h-10ZM834 186h44v10h-44ZM890 196h44v10h-44Z" />
          </g>
        </g>
        <g className="hz__near">
          <path d="M0 320v-12c240-8 480-4 720-6s480 4 720 6v12Z" />
          <g className="hz__sway">
            <path d={TULIPS} />
            <path d={protea(120, 282) + protea(470, 286) + protea(1010, 280) + protea(1360, 284)} />
          </g>
        </g>
      </svg>
      <i className="hz__tile" />
    </div>
  );
}
