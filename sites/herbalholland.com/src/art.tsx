// Illustration for herbalholland.com, all SVG and all drawn from the mark: the windmill (ring, tower, four petals),
// the striped sunset (the Sunset Hoodie print), KwaZulu-Natal's rolling hills and the globe. The province map has its
// own file (./map). No photos, no people.
// Colours come from CSS classes (site.css), never from attributes, so every tone stays on the brand tokens.
import { PETAL } from "@/components/brand/logo";
import { FACTS, firstStores } from "../facts";
import { coasts, equator, graticule, ortho, route, routePath, type LL } from "./geo";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const r0 = (n: number) => Math.round(n);

// ── Hills ────────────────────────────────────────────────────────────────────
// Rolling hill silhouettes in a 1600 × 1000 scene: overlapping rounded hills (a soft maximum of Gaussian bumps), the
// "Valley of a Thousand Hills" look. Seeded, so the art is the same on every build.
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

/** Shared shapes and paint for every picture on the page: hills, the petal, the sun's paint and stripes. */
export function Sprite() {
  return (
    <svg className="sprite" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        {Object.entries(HILLS).map(([id, d]) => (
          <path key={id} id={id} d={d} />
        ))}
        <path id="petal" d={PETAL} />
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

// ── The sunset scene ─────────────────────────────────────────────────────────
/**
 * Layered sunset: the striped sun with its glow, hills, and (optionally) the windmill standing on its own knoll in
 * front of the sun, so the mark becomes the landscape: the ring is the sun, the tower stands in the gap. Each layer is
 * its own <svg> so parallax moves whole layers on the compositor; `.sc__pos` groups are placed per breakpoint in CSS.
 */
export type SceneSpec = {
  /** Sun centre and radius in scene units (1600 × 1000). */
  sun: { x: number; y: number; r: number };
  mill?: boolean;
  /** The visible band of the scene: "0 0 1600 1000" for a full scene, a lower strip for page headers. */
  view?: string;
  hills?: (keyof typeof HILLS)[];
  /** Keep the top of the band (the sun, the sails) and let wide screens crop the ground instead. */
  top?: boolean;
};

export function Scene({ kind, spec, className }: { kind: string; spec: SceneSpec; className?: string }) {
  const { sun, mill, view = "0 0 1600 1000", hills = ["hl1", "hl2", "hl3", "hl4"], top } = spec;
  const svg = (cls: string, body: React.ReactNode, key?: string) => (
    <svg key={key} className={cx("sc__l", cls)} viewBox={view} preserveAspectRatio={`xMidY${top ? "Min" : "Max"} slice`} focusable="false">
      {body}
    </svg>
  );
  const s = sun.r / 40; // the mark's ring has radius 40
  const tx = sun.x - 50 * s;
  const ty = sun.y - 45.06 * s; // the ring's centre sits at (50, 45.06) in the mark
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

// Scene set-ups for each page. The home hero is the full picture; page headers get a lower strip at dusk.
export const SCENES: Record<string, SceneSpec> = {
  home: { sun: { x: 1150, y: 565, r: 225 }, mill: true },
  stores: { sun: { x: 860, y: 690, r: 160 }, view: "0 470 1600 530", mill: true, top: true },
  about: { sun: { x: 420, y: 735, r: 150 }, view: "0 470 1600 530", top: true },
  franchise: { sun: { x: 1190, y: 700, r: 175 }, view: "0 470 1600 530", mill: true, top: true },
  press: { sun: { x: 800, y: 770, r: 190 }, view: "0 470 1600 530", top: true },
  careers: { sun: { x: 300, y: 720, r: 140 }, view: "0 470 1600 530", top: true },
  contact: { sun: { x: 1260, y: 760, r: 165 }, view: "0 470 1600 530", top: true },
  // Placed where phones see it too (x 490–1110 of the band), so it needs no per-breakpoint rule.
  privacy: { sun: { x: 700, y: 680, r: 150 }, view: "0 470 1600 530", top: true },
  terms: { sun: { x: 950, y: 665, r: 140 }, view: "0 470 1600 530", top: true },
  paia: { sun: { x: 560, y: 690, r: 130 }, view: "0 470 1600 530", top: true },
  gate: { sun: { x: 800, y: 790, r: 210 }, view: "0 380 1600 620", hills: ["hl1", "hl2", "hl3"] },
  notfound: { sun: { x: 1150, y: 565, r: 225 }, mill: true },
  storeA: { sun: { x: 1010, y: 700, r: 150 }, view: "260 470 1200 530" },
  storeB: { sun: { x: 560, y: 735, r: 135 }, view: "180 480 1200 520" },
};

// ── The globe ────────────────────────────────────────────────────────────────
const G = { c: [6, 0] as LL, R: 270, lift: 0.12, dots: 56 };

export function Globe({ label }: { label: string }) {
  const P = ortho(G.c, G.R, 300, 300);
  const first = firstStores()[0];
  const a: LL = [FACTS.places.amsterdam.lat, FACTS.places.amsterdam.lon];
  const b: LL = [first.lat, first.lon];
  const pts = route(P, a, b, 96, G.lift);
  const dots = route(P, a, b, G.dots, G.lift);
  const pa = P(a);
  const pb = P(b);
  const f = (n: number) => Math.round(n * 10) / 10;
  // A pin for every store; stores a few pixels apart on the globe share one, and its label names them all.
  const pins: { x: number; y: number; names: string[]; end: boolean }[] = [];
  for (const s of FACTS.stores) {
    const p = P([s.lat, s.lon]);
    const near = pins.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < 14);
    if (near) (near.names.push(s.name), (near.end ||= s.key === first.key));
    else pins.push({ x: p.x, y: p.y, names: [s.name], end: s.key === first.key });
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
              {q.names.join(" · ")}
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
