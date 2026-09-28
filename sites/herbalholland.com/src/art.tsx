// Illustration for herbalholland.com, all SVG and all drawn from the mark: the windmill (ring, tower, four petals),
// the striped sunset (the Sunset Hoodie print), a Dutch polder (dyke and canal), the sea, KwaZulu-Natal's rolling
// hills, the stars and the Southern Cross, the globe, the drawn storefront and the beadwork tile. The province map has
// its own file (./map). No photos, no people.
// Colours come from CSS classes (site.css), never from attributes, so every tone stays on the brand tokens.
//
// The home page is one journey, and its landscape lives on the Stage: a fixed layer behind the page that holds the
// sky, the sun, the stars, the polder, the sea, the hills and the windmill. The page's scroll (CSS scroll-driven
// animations where the browser has them, the page's script otherwise) moves the sky from gold to night and the ground
// from Holland to the hills, and the script flies the windmill from scene to scene. Every scene also has a Still: the
// same landscape at that scene's time of day, drawn once, for reduced motion, low-power devices and no script.
import { PETAL } from "@/components/brand/logo";
import { PROVINCES } from "@/lib/sa";
import { FACTS, newStores } from "../facts";
import { coasts, equator, graticule, ortho, route, routePath, type LL } from "./geo";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const r0 = (n: number) => Math.round(n);

// ── The beadwork ─────────────────────────────────────────────────────────────
/**
 * The site's beadwork: one small African geometric tile, a chain of diamonds in cream, orange and charcoal (after the
 * panel beside the door in the store concept). It frames the 18+ gate, edges the frames and the scene dividers, and
 * bands the footer. The CSS gets it as a data: URL (build.ts puts it in place of __PATTERN__); the SVG sprite has it as
 * a pattern (#beads) for the drawn storefront. Its colours are the token values ink-900, ink-50 and brand-500 — the one
 * place colours are written into art rather than set by CSS.
 */
export const TILE = [
  { fill: "#141110", d: "M0 0h24v24H0z" },
  { fill: "#fbf7f3", d: "M12 3l9 9-9 9-9-9z" },
  { fill: "#141110", d: "M12 6.5l5.5 5.5-5.5 5.5-5.5-5.5z" },
  { fill: "#f5913c", d: "M12 9l3 3-3 3-3-3zM0 0h5L0 5zm24 0v5l-5-5zM0 24v-5l5 5zm24 0h-5l5-5z" },
] as const;

/** The tile as a CSS url() (a data: URL, which the CSP's img-src allows). */
export const patternUrl = () => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>${TILE.map((s) => `<path fill='${s.fill}' d='${s.d}'/>`).join("")}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/[<>#]/g, encodeURIComponent)}")`;
};

// ── Seeded randomness (the art is the same on every build) ───────────────────
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Hills ────────────────────────────────────────────────────────────────────
// Rolling hill silhouettes in a 1600 × 1000 scene: overlapping rounded hills (a soft maximum of Gaussian bumps), the
// "Valley of a Thousand Hills" look.
function ridge(seed: number, base: number, [hMin, hMax]: [number, number], [wMin, wMax]: [number, number], count: number) {
  const rand = rng(seed);
  const x0 = -240;
  const x1 = 1840;
  const bumps = Array.from({ length: count }, (_, i) => ({ c: x0 + ((i + 0.15 + rand() * 0.7) * (x1 - x0)) / count, h: hMin + rand() * (hMax - hMin), w: wMin + rand() * (wMax - wMin) }));
  // Each hill is a rounded bump; where two meet, the valley between them.
  const y = (x: number) => base - Math.max(...bumps.map((b) => b.h * Math.exp(-(((x - b.c) / b.w) ** 2))));
  const pts: [number, number][] = [];
  for (let x = x0; x <= x1; x += 40) pts.push([x, y(x)]);
  let d = `M${x0} 1100L${pts[0][0]} ${r0(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${r0(p1[0] + (p2[0] - p0[0]) / 6)} ${r0(p1[1] + (p2[1] - p0[1]) / 6)} ${r0(p2[0] - (p3[0] - p1[0]) / 6)} ${r0(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${r0(p2[1])}`;
  }
  return `${d}L${x1} 1100Z`;
}

export const HILLS = {
  hl1: ridge(7, 706, [60, 125], [150, 250], 11), // far
  hl2: ridge(31, 786, [55, 120], [180, 300], 9), // mid
  hl3: ridge(58, 884, [40, 90], [230, 380], 7), // near
  hl4: ridge(94, 968, [16, 40], [300, 480], 5), // front
};

// ── The polder and the sea ───────────────────────────────────────────────────
// Holland is flat: a far field, a long dyke, a canal that catches the sun, and the near bank. All in the same 1600 ×
// 1000 units as the hills, with the horizon at the same height (y 700), so one ground gives way to the next.
export const POLDER = {
  far: "M-240 1100V712C200 704 600 700 1000 704S1500 708 1840 704V1100Z",
  dyke: "M-240 1100V752L300 748C700 744 1100 744 1840 750V1100Z",
  canal: "M-240 812H1840V872H-240Z",
  near: "M-240 1100V880C300 868 800 868 1840 878V1100Z",
  ripples: "M120 830h210M560 852h160M880 826h280M1280 846h170",
};
export const SEA = { water: "M-240 1100V706H1840V1100Z", shimmer: "M640 745h120M700 780h190M760 820h110M900 745h180M980 790h80M1120 760h140" };

// ── The stars ────────────────────────────────────────────────────────────────
// A field of small stars over the top two thirds of the scene, and the Southern Cross with its two Pointers, drawn as
// they stand in the evening sky over KwaZulu-Natal (Crux upright, the Pointers to its left).
const stars = (() => {
  const rand = rng(2026);
  return Array.from({ length: 110 }, () => ({ x: r0(rand() * 1600), y: r0(rand() * 640), r: +(0.7 + rand() * 1.5).toFixed(1), o: +(0.35 + rand() * 0.65).toFixed(2) }));
})();
const CRUX = { at: [700, 250] as const, stars: [[0, -62, 5], [4, 58, 5.5], [-46, 10, 5], [40, -8, 4.2], [-18, 26, 2.6]] as const, pointers: [[-190, 78, 5], [-140, 60, 4.2]] as const };

/** Shared shapes and paint for every picture on the page: the ground, the petal, the sun's paint, the beadwork. */
export function Sprite() {
  return (
    <svg className="sprite" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        {Object.entries(HILLS).map(([id, d]) => (
          <path key={id} id={id} d={d} />
        ))}
        <path id="petal" d={PETAL} />
        <g id="polder">
          <path className="f-hl1" d={POLDER.far} />
          <path className="f-hl2" d={POLDER.dyke} />
          <path className="f-canal" d={POLDER.canal} />
          <path className="s-ripple" d={POLDER.ripples} />
          <path className="f-hl3" d={POLDER.near} />
        </g>
        <g id="sea">
          <path className="f-sea" d={SEA.water} />
          <path className="s-ripple" d={SEA.shimmer} />
        </g>
        <g id="stars">
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
          ))}
        </g>
        <g id="crux" transform={`translate(${CRUX.at[0]} ${CRUX.at[1]})`}>
          {[...CRUX.stars, ...CRUX.pointers].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle className="star__glow" r={r * 4} />
              <circle r={r} />
            </g>
          ))}
        </g>
        <symbol id="mill" viewBox="0 0 100 100">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M33 91 50 44.5 67 91" strokeWidth="5.5" />
            <path d="M42.5 91 50 69 57.5 91" strokeWidth="3.2" />
            <g transform="translate(50 40)">
              {[-45, 45, 135, 225].map((r) => (
                <use key={r} href="#petal" transform={`rotate(${r})`} strokeWidth="3.6" fill="currentColor" />
              ))}
              <circle r="3.4" strokeWidth="2.4" />
            </g>
          </g>
        </symbol>
        <symbol id="sun" viewBox="-120 -120 240 240">
          <circle r="112" fill="url(#glow)" />
          <circle r="42" fill="url(#sunfill)" mask="url(#stripes)" />
        </symbol>
        <linearGradient id="sunfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="st-sun0" />
          <stop offset=".55" className="st-sun1" />
          <stop offset="1" className="st-sun2" />
        </linearGradient>
        <radialGradient id="glow">
          <stop offset="0" className="st-glow0" />
          <stop offset=".35" className="st-glow1" />
          <stop offset="1" className="st-glow2" />
        </radialGradient>
        <linearGradient id="canal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="st-canal0" />
          <stop offset=".62" className="st-canal1" />
          <stop offset="1" className="st-canal0" />
        </linearGradient>
        <linearGradient id="seafill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="st-sea0" />
          <stop offset="1" className="st-sea1" />
        </linearGradient>
        <mask id="stripes" maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill="#fff" />
          {[
            [0.43, 0.01],
            [0.505, 0.015],
            [0.575, 0.021],
            [0.643, 0.027],
            [0.708, 0.033],
            [0.77, 0.039],
            [0.83, 0.045],
            [0.887, 0.051],
            [0.942, 0.058],
          ].map(([y, h]) => (
            <rect key={y} y={y} width="1" height={h} fill="#000" />
          ))}
        </mask>
        <radialGradient id="sphere" cx=".38" cy=".3" r=".8">
          <stop offset="0" className="st-sph0" />
          <stop offset="1" className="st-sph1" />
        </radialGradient>
        <radialGradient id="halo">
          <stop offset=".86" className="st-halo0" />
          <stop offset=".905" className="st-halo1" />
          <stop offset="1" className="st-halo0" />
        </radialGradient>
        <clipPath id="disc">
          <circle cx="300" cy="300" r="270" />
        </clipPath>
        <pattern id="beads" width="24" height="24" patternUnits="userSpaceOnUse">
          {TILE.map((s, i) => (
            <path key={i} fill={s.fill} d={s.d} />
          ))}
        </pattern>
        <radialGradient id="starglow">
          <stop offset="0" className="st-star0" />
          <stop offset="1" className="st-star1" />
        </radialGradient>
        <linearGradient id="shopglow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="st-shop0" />
          <stop offset="1" className="st-shop1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── The mark ─────────────────────────────────────────────────────────────────
/**
 * The four petals and the hub, in the mark's own units around (0, 0). `js`: "wind" lets the page's script add turns
 * while the page scrolls; "" also keeps a steady CSS turn underneath (the windmill never stops, the wind speeds it up).
 */
export function Sails({ className, js }: { className?: string; js?: "" | "wind" }) {
  const petals = (
    <>
      {[-45, 45, 135, 225].map((r) => (
        <use key={r} href="#petal" transform={`rotate(${r})`} strokeWidth="3.6" />
      ))}
      <circle r="3.4" strokeWidth="2.4" />
      <circle r=".9" className="hub" stroke="none" />
    </>
  );
  if (js === "")
    return (
      <g className={cx("sails", "sails--spin", className)}>
        <g className="sails" data-sails="wind">
          {petals}
        </g>
      </g>
    );
  return (
    <g className={cx("sails", className)} data-sails={js}>
      {petals}
    </g>
  );
}

/**
 * The windmill mark (100-unit box, currentColor). `sails`: "spin" turns them with CSS; "js" lets the page's script turn
 * them (a steady turn, faster with the scroll); "wind" turns them only while the page scrolls; "gust" spins with CSS
 * inside a second group that the gate and the enquiry form spin up for a moment.
 */
export function Mark({ className, title, sails, ring = true }: { className?: string; title?: string; sails?: "spin" | "js" | "wind" | "gust"; ring?: boolean }) {
  const s = <Sails className={sails === "spin" ? "sails--spin" : undefined} js={sails === "js" ? "" : sails === "wind" ? "wind" : undefined} />;
  return (
    <svg viewBox="0 0 100 100" className={cx("mark", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"} focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {ring && <path className="mark__ring" d="M36.2 82.6A40 40 0 1 1 63.8 82.6" strokeWidth="5.5" />}
        <path className="mark__tower" d="M33 91 50 44.5 67 91" strokeWidth="5.5" />
        <path className="mark__inner" d="M42.5 91 50 69 57.5 91" strokeWidth="3.2" />
        <g transform="translate(50 40)">
          {sails === "gust" ? (
            <g className="gust">
              <Sails className="sails--spin" />
            </g>
          ) : (
            s
          )}
        </g>
      </g>
    </svg>
  );
}

/** HERBAL / HOLLAND, as in the lock-up. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("wm", className)}>
      <span className="wm__a">Herbal</span> <span className="wm__b">Holland</span>
    </span>
  );
}

/** The 18+ roundel. */
export function AgeBadge({ className }: { className?: string }) {
  return (
    <span className={cx("age", className)} aria-hidden="true">
      18+
    </span>
  );
}

// ── The stage ────────────────────────────────────────────────────────────────
/**
 * The landscape behind the whole page (position: fixed; still, and positioned inside the opening scene, without
 * motion). Its state is five numbers, --t1 … --t4 (how far each later scene has entered the screen) and the time of
 * day they add up to; the CSS turns them into the sky, the sun's place, the ground and the stars. `state` fixes them
 * for an inner page: "gold" (the polder), "sea", "dusk" (the hills, sun low), "late" (the hills, sun gone) or "night".
 * The windmill is placed by the script (each scene says where it stands, in --mill), and drawn with a dark stroke and
 * a warm one over it that shows as the sky darkens.
 */
export type StageState = "gold" | "sea" | "dusk" | "late" | "night";

export function Stage({ state }: { state?: StageState }) {
  const layer = (cls: string, body: React.ReactNode) => (
    <svg className={cx("stage__l", cls)} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" focusable="false">
      {body}
    </svg>
  );
  const mill = (cls: string) => (
    <g className={cls} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M33 91 50 44.5 67 91" strokeWidth="5.5" />
      <path d="M42.5 91 50 69 57.5 91" strokeWidth="3.2" />
      <g transform="translate(50 40)" className="mill__sails">
        <Sails js="" />
      </g>
    </g>
  );
  return (
    <div className="stage" data-stage={state ?? "home"} aria-hidden="true">
      <div className="stage__sky stage__sky--gold" />
      <div className="stage__sky stage__sky--dusk" />
      <div className="stage__sky stage__sky--night" />
      <svg className="stage__stars" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" focusable="false">
        <use href="#stars" />
        <use href="#crux" />
      </svg>
      <div className="stage__sun">
        <svg viewBox="-120 -120 240 240" focusable="false">
          <use href="#sun" x="-120" y="-120" width="240" height="240" />
        </svg>
      </div>
      {layer("stage__polder", <use href="#polder" />)}
      {layer("stage__sea", <use href="#sea" />)}
      {layer("stage__hl1", <use href="#hl1" className="f-hl1" />)}
      {layer("stage__hl2", <use href="#hl2" className="f-hl2" />)}
      <div className="stage__mill" data-mill-stage="">
        <svg viewBox="0 0 100 100" focusable="false">
          {mill("mill mill--dark")}
          {mill("mill mill--warm")}
        </svg>
      </div>
      {layer("stage__hl3", <use href="#hl3" className="f-hl3" />)}
      {layer("stage__hl4", <use href="#hl4" className="f-hl4" />)}
    </div>
  );
}

/**
 * A scene's still picture: the landscape at that time of day, drawn once for reduced motion, low-power devices and
 * pages without script. The opening scene needs none (the stage stands still inside it).
 */
export function Still({ kind }: { kind: "sea" | "dusk" | "late" | "night" }) {
  const sun = { sea: [1120, 560, 150], dusk: [560, 700, 210], late: null, night: null }[kind];
  return (
    <svg className={cx("still", `still--${kind}`)} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      {kind === "night" && (
        <>
          <use href="#stars" className="f-star" />
          <use href="#crux" className="f-star" />
        </>
      )}
      {sun && <use href="#sun" x={sun[0] - sun[2] * 2.86} y={sun[1] - sun[2] * 2.86} width={sun[2] * 5.72} height={sun[2] * 5.72} />}
      {kind === "sea" ? (
        <use href="#sea" />
      ) : (
        <>
          <use href="#hl1" className="f-hl1" />
          <use href="#hl2" className="f-hl2" />
          <use href="#mill" x="1010" y="590" width="260" height="260" className={kind === "night" ? "c-warm" : "c-dark"} />
          <use href="#hl3" className="f-hl3" />
          <use href="#hl4" className="f-hl4" />
        </>
      )}
    </svg>
  );
}

// ── The sunset scene (the share image only) ──────────────────────────────────
export type SceneSpec = { sun: { x: number; y: number; r: number }; mill?: boolean; view?: string; hills?: (keyof typeof HILLS)[]; top?: boolean };

export function Scene({ kind, spec, className }: { kind: string; spec: SceneSpec; className?: string }) {
  const { sun, mill, view = "0 0 1600 1000", hills = ["hl1", "hl2", "hl3", "hl4"], top } = spec;
  const svg = (cls: string, body: React.ReactNode, key?: string) => (
    <svg key={key} className={cx("sc__l", cls)} viewBox={view} preserveAspectRatio={`xMidY${top ? "Min" : "Max"} slice`} focusable="false">
      {body}
    </svg>
  );
  const s = sun.r / 40;
  const tx = sun.x - 50 * s;
  const ty = sun.y - 45.06 * s;
  const [back, front] = mill ? [hills.slice(0, 2), hills.slice(2)] : [hills.slice(0, -1), hills.slice(-1)];
  return (
    <div className={cx("sc", `sc--${kind}`, className)} aria-hidden="true">
      {svg(
        "sc__sun",
        <g className="sc__pos">
          <circle className="sc__glow" cx={sun.x} cy={sun.y} r={sun.r * 2.6} fill="url(#glow)" />
          <circle className="sc__disc" cx={sun.x} cy={sun.y} r={sun.r} fill="url(#sunfill)" mask="url(#stripes)" />
        </g>,
      )}
      {back.map((h) => svg(`sc__${h}`, <use href={`#${h}`} className={`f-${h}`} />, h))}
      {mill &&
        svg(
          "sc__mill",
          <g className="sc__pos">
            <g transform={`translate(${r0(tx)} ${r0(ty)}) scale(${s.toFixed(3)})`} fill="none" strokeLinecap="round" strokeLinejoin="round" className="mill">
              <path className="f-knoll" stroke="none" d="M-90 150C-20 150 12 84 50 84 88 84 120 150 190 150L190 240-90 240Z" />
              <path d="M33 91 50 44.5 67 91" strokeWidth="5.5" />
              <path d="M42.5 91 50 69 57.5 91" strokeWidth="3.2" />
              <g transform="translate(50 40)" className="mill__sails">
                <Sails js="" />
              </g>
            </g>
          </g>,
        )}
      {front.map((h) => svg(`sc__${h}`, <use href={`#${h}`} className={`f-${h}`} />, h))}
    </div>
  );
}

/** A small sunset for wide, short spaces (the Founding Member card): the sun low at the right, three gentle ridges. */
export function MiniScene({ className }: { className?: string }) {
  return (
    <svg className={cx("mini", className)} viewBox="0 0 480 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <circle cx="392" cy="112" r="120" fill="url(#glow)" />
      <circle cx="392" cy="112" r="46" fill="url(#sunfill)" mask="url(#stripes)" />
      <path className="f-hl1" d="M0 112C60 92 120 96 170 104S270 86 330 98 430 88 480 100V150H0Z" />
      <path className="f-hl2" d="M0 126C70 112 140 118 210 123S330 108 400 118 460 112 480 116V150H0Z" />
      <path className="f-hl3" d="M0 140C90 130 180 134 260 137S400 126 480 134V150H0Z" />
    </svg>
  );
}

// ── The drawn storefront ─────────────────────────────────────────────────────
/**
 * A Herbal Holland store, drawn from the concept renders: a charcoal front, the round windmill sign lit above the door,
 * the beadwork panel beside it, warm light in the window and two pots at the step. It fills a store's frame until the
 * owner's photograph replaces it; the frame is the same either way. `n` varies the window (which side the door is on).
 */
export function Storefront({ n = 0, className }: { n?: number; className?: string }) {
  const flip = n % 2 === 1;
  return (
    <svg className={cx("shopfront", className)} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g transform={flip ? "matrix(-1 0 0 1 400 0)" : undefined}>
        <rect className="sf-wall" width="400" height="300" />
        <rect className="sf-band" y="34" width="400" height="18" />
        <rect className="sf-window" x="40" y="86" width="176" height="172" rx="6" />
        <rect className="sf-shelf" x="58" y="128" width="140" height="6" rx="3" />
        <rect className="sf-shelf" x="58" y="172" width="140" height="6" rx="3" />
        <rect className="sf-shelf" x="58" y="216" width="140" height="6" rx="3" />
        {[70, 102, 134, 166].map((x) => (
          <rect key={x} className="sf-jar" x={x} y="108" width="18" height="20" rx="3" />
        ))}
        {[76, 118, 160].map((x) => (
          <rect key={x} className="sf-jar" x={x} y="150" width="22" height="22" rx="3" />
        ))}
        <rect className="sf-frame" x="40" y="86" width="176" height="172" rx="6" />
        <rect className="sf-door" x="250" y="118" width="80" height="182" rx="4" />
        <rect className="sf-doorlight" x="262" y="132" width="56" height="112" rx="3" />
        <circle className="sf-handle" cx="316" cy="214" r="3.5" />
        <rect className="sf-beads" x="344" y="118" width="30" height="182" fill="url(#beads)" />
        <rect className="sf-frame" x="344" y="118" width="30" height="182" />
        <circle className="sf-sign" cx="290" cy="76" r="26" />
        <g transform="translate(268 54) scale(.44)" className="sf-mark">
          <path d="M36.2 82.6A40 40 0 1 1 63.8 82.6" strokeWidth="6" />
          <path d="M33 91 50 44.5 67 91" strokeWidth="6" />
          <g transform="translate(50 40)">
            {[-45, 45, 135, 225].map((r) => (
              <use key={r} href="#petal" transform={`rotate(${r})`} strokeWidth="4" />
            ))}
          </g>
        </g>
        <rect className="sf-step" y="272" width="400" height="28" />
        <path className="sf-pot" d="M218 272l4-30h26l4 30z" />
        <path className="sf-leaf" d="M232 244c-4-18 4-30 10-36M232 244c2-14 12-22 20-26M232 244c-8-10-20-12-26-12" />
        <path className="sf-pot" d="M378 272l3-22h20l3 22z" />
        <path className="sf-leaf" d="M391 250c-3-14 3-22 8-26M391 250c-6-8-14-10-18-10" />
      </g>
    </svg>
  );
}

// ── What's in store: seven still-lifes ───────────────────────────────────────
// One object per category, drawn in the mark's line (round caps, orange on charcoal): a dropper bottle, a coffee cup,
// a tin of balm, a tub with its scoop, a storage jar, a tee with the windmill, and a seedling in a pot. Each fills a
// frame until the owner's product photographs replace it.
const CATS: Record<string, React.ReactNode> = {
  cbd: (
    <>
      <rect x="36" y="38" width="28" height="44" rx="6" />
      <path d="M44 38v-8h12v8M50 14v8M46 22h8" />
      <path d="M42 62h16" className="thin" />
    </>
  ),
  food: (
    <>
      <path d="M28 46h44v18a14 14 0 0 1-14 14H42a14 14 0 0 1-14-14z" />
      <path d="M72 50h6a8 8 0 0 1 0 16h-6" />
      <path d="M22 84h56" className="thin" />
      <path d="M42 36c0-6 4-6 4-12M54 36c0-6 4-6 4-12" className="thin" />
    </>
  ),
  skin: (
    <>
      <rect x="24" y="44" width="40" height="30" rx="8" />
      <path d="M22 44h44" />
      <path d="M32 44v-8a12 12 0 0 1 24 0v8" className="thin" />
      <rect x="70" y="30" width="12" height="44" rx="4" />
      <path d="M72 30v-6h8v6" className="thin" />
    </>
  ),
  supplements: (
    <>
      <rect x="30" y="34" width="40" height="46" rx="8" />
      <path d="M26 34h48" />
      <rect x="36" y="22" width="28" height="12" rx="4" />
      <path d="M40 58h20" className="thin" />
      <path d="M76 82l8-16a4 4 0 0 1 6 4l-4 8" className="thin" />
    </>
  ),
  accessories: (
    <>
      <rect x="32" y="36" width="36" height="46" rx="7" />
      <rect x="28" y="28" width="44" height="10" rx="4" />
      <path d="M40 54h20M40 64h20" className="thin" />
    </>
  ),
  apparel: (
    <>
      <path d="M36 26l14-6 14 6 12 10-8 8-4-3v41H36V41l-4 3-8-8z" />
      <path d="M43.5 60.6A6.5 6.5 0 1 1 56.5 60.6" className="thin" />
      <path d="M46 68 50 57 54 68" className="thin" />
    </>
  ),
  grow: (
    <>
      <path d="M34 54h32l-4 28H38z" />
      <path d="M30 54h40" />
      <path d="M50 54V36" />
      <path d="M50 42c0-10 8-14 16-14 0 10-6 16-16 16zM50 38c0-8-6-12-14-12 0 8 4 14 14 14z" />
    </>
  ),
};

export function CatArt({ kind }: { kind: string }) {
  return (
    <svg className="catart" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle className="catart__glow" cx="50" cy="56" r="34" fill="url(#shopglow)" />
      <g className="catart__line">{CATS[kind] ?? CATS.cbd}</g>
    </svg>
  );
}

// ── The globe ────────────────────────────────────────────────────────────────
const G = { c: [6, 0] as LL, R: 270, lift: 0.12, dots: 56 };

export function Globe({ label }: { label: string }) {
  const P = ortho(G.c, G.R, 300, 300);
  // The story ends at the first of the new stores (Hillcrest, in the hills).
  const first = newStores()[0] ?? FACTS.stores[0];
  const a: LL = [FACTS.places.amsterdam.lat, FACTS.places.amsterdam.lon];
  const b: LL = [first.lat, first.lon];
  const pts = route(P, a, b, 96, G.lift);
  const dots = route(P, a, b, G.dots, G.lift);
  const pa = P(a);
  const pb = P(b);
  const f = (n: number) => Math.round(n * 10) / 10;
  // A pin for every store; stores a few pixels apart on the globe share one, labelled with their names (two), or with
  // their province (more).
  const pins: { x: number; y: number; names: string[]; province: string; end: boolean }[] = [];
  for (const s of FACTS.stores) {
    const p = P([s.lat, s.lon]);
    const near = pins.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < 14);
    if (near) (near.names.push(s.name), (near.end ||= s.key === first.key));
    else pins.push({ x: p.x, y: p.y, names: [s.name], province: PROVINCES[s.province], end: s.key === first.key });
  }
  return (
    <svg
      className="globe"
      viewBox="0 0 600 600"
      role="img"
      aria-label={label}
      focusable="false"
      data-globe=""
      data-route={`${a.join(" ")} ${b.join(" ")}`}
      data-view={`${G.c.join(" ")} ${G.R} ${G.lift}`}
      data-end={`${f(pb.x)} ${f(pb.y)}`}
      data-start={`${f(pa.x)} ${f(pa.y)}`}
    >
      <circle className="globe__halo" cx="300" cy="300" r="300" fill="url(#halo)" />
      <circle className="globe__disc" cx="300" cy="300" r="270" fill="url(#sphere)" />
      <g clipPath="url(#disc)">
        <g className="globe__zoom">
          <path className="globe__grat" d={graticule(P)} vectorEffect="non-scaling-stroke" />
          <path className="globe__eq" d={equator(P)} vectorEffect="non-scaling-stroke" />
          <path className="globe__coast" d={coasts(P)} vectorEffect="non-scaling-stroke" />
          <path className="globe__route" d={routePath(pts)} vectorEffect="non-scaling-stroke" />
          <g className="globe__dots">
            {dots.map((p, i) => (
              <circle key={i} className="dot" cx={f(p.x)} cy={f(p.y)} r="2.3" data-t={p.t.toFixed(3)} />
            ))}
          </g>
        </g>
      </g>
      <circle className="globe__rim" cx="300" cy="300" r="270" fill="none" />
      {/* Pins and labels zoom with the map but aren't clipped to the disc. */}
      <g className="globe__zoom">
        <g className="pin pin--a" transform={`translate(${f(pa.x)} ${f(pa.y)})`}>
          <circle r="5" />
          <text x="-12" y="-12" textAnchor="end">
            {FACTS.places.amsterdam.name}
          </text>
        </g>
        {pins.map((q) => (
          <g key={q.names[0]} className={cx("pin", q.end && "pin--b")} transform={`translate(${f(q.end ? pb.x : q.x)} ${f(q.end ? pb.y : q.y)})`}>
            {q.end && <circle className="pin__pulse" r="12" />}
            <circle r="5" />
            <text x={q.end ? -14 : 12} y={q.end ? 30 : 6} textAnchor={q.end ? "end" : "start"}>
              {q.names.length > 2 ? q.province : q.names.join(" · ")}
            </text>
          </g>
        ))}
        <g className="plane" data-plane="">
          <circle className="plane__ring" r="13" />
          <circle className="plane__dot" r="5.5" />
        </g>
      </g>
    </svg>
  );
}
