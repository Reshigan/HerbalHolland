// Globe geometry for the "9,475 km" story: an orthographic projection of real coordinates, the great circle from
// Amsterdam to Hillcrest, a graticule and simplified coastlines. Everything is computed at build time into SVG paths;
// the page's script only moves a marker along the same great circle (the math is repeated there, in a few lines).

export type LL = readonly [lat: number, lon: number];
type V3 = [number, number, number];

const D = Math.PI / 180;

export const toV = ([lat, lon]: LL): V3 => [Math.cos(lat * D) * Math.cos(lon * D), Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D)];
export const toLL = ([x, y, z]: V3): LL => [Math.asin(Math.max(-1, Math.min(1, z))) / D, Math.atan2(y, x) / D];

/** Angle between two points, in radians. */
export const angle = (a: LL, b: LL) => {
  const [x1, y1, z1] = toV(a);
  const [x2, y2, z2] = toV(b);
  return Math.acos(Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2)));
};

/** The point a fraction `t` of the way along the great circle from a to b. */
export function slerp(a: LL, b: LL, t: number): LL {
  const va = toV(a);
  const vb = toV(b);
  const w = angle(a, b);
  const s = Math.sin(w);
  const ka = Math.sin((1 - t) * w) / s;
  const kb = Math.sin(t * w) / s;
  return toLL([va[0] * ka + vb[0] * kb, va[1] * ka + vb[1] * kb, va[2] * ka + vb[2] * kb]);
}

export type Projection = (p: LL, lift?: number) => { x: number; y: number; v: boolean };

/** Orthographic projection centred on `c`, radius R, drawn around (cx, cy) with SVG's y pointing down. */
export function ortho(c: LL, R: number, cx: number, cy: number): Projection {
  const f0 = c[0] * D;
  const l0 = c[1] * D;
  return ([lat, lon], lift = 0) => {
    const f = lat * D;
    const dl = lon * D - l0;
    const cosc = Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(dl);
    const k = R * (1 + lift);
    return { x: cx + k * Math.cos(f) * Math.sin(dl), y: cy - k * (Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(dl)), v: cosc >= 0 };
  };
}

/** Straight segments through the visible runs of a projected line. */
function runs(pts: { x: number; y: number; v: boolean }[]) {
  const out: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  for (const p of pts) {
    if (p.v) cur.push(p);
    else if (cur.length) (out.push(cur), (cur = []));
  }
  if (cur.length) out.push(cur);
  return out.filter((r) => r.length > 1);
}

// Paths are written in tenths of a unit, relative to the last point, with no separator before a minus sign: the
// shortest exact form ("l3.2-1.4"). Every point is rounded first, so the relative steps never drift.
const T = (n: number) => Math.round(n * 10);
const fmt = (t: number) => (t / 10).toFixed(1).replace(/\.0$/, "").replace(/^(-?)0\./, "$1.");
const nums = (...ts: number[]) => ts.map(fmt).map((v, i) => (i && v[0] !== "-" ? ` ${v}` : v)).join("");

/** Straight segments through the points. */
const line = (r: { x: number; y: number }[]) => {
  let [cx, cy] = [T(r[0].x), T(r[0].y)];
  let d = `M${nums(cx, cy)}`;
  for (const p of r.slice(1)) {
    const [x, y] = [T(p.x), T(p.y)];
    d += `l${nums(x - cx, y - cy)}`;
    [cx, cy] = [x, y];
  }
  return d;
};

/** A smooth path (Catmull-Rom as cubic Béziers) through the points. Each segment's first control point is the
 *  reflection of the last one's second, which is what "s" draws, so only the first segment is written in full. */
function smooth(r: { x: number; y: number }[], closed = false) {
  if (r.length < 3) return line(r);
  const n = r.length;
  const at = (i: number) => (closed ? r[(i + n) % n] : r[Math.max(0, Math.min(n - 1, i))]);
  let [cx, cy] = [T(r[0].x), T(r[0].y)];
  let d = `M${nums(cx, cy)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const [x, y] = [T(p2.x), T(p2.y)];
    const c2 = [T(p2.x - (p3.x - p1.x) / 6) - cx, T(p2.y - (p3.y - p1.y) / 6) - cy];
    d += i ? `s${nums(...c2, x - cx, y - cy)}` : `c${nums(T(p1.x + (p2.x - p0.x) / 6) - cx, T(p1.y + (p2.y - p0.y) / 6) - cy, ...c2, x - cx, y - cy)}`;
    [cx, cy] = [x, y];
  }
  return closed ? `${d}z` : d;
}

/** Meridians and parallels every `step` degrees, as one path of visible runs. */
export function graticule(P: Projection, step = 15) {
  // A point every 6°: the chord of a 6° arc on this globe is under half a unit off the circle.
  const parts: string[] = [];
  for (let lon = -180; lon < 180; lon += step) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 6) pts.push(P([lat, lon]));
    parts.push(...runs(pts).map(line));
  }
  for (let lat = -90 + step; lat < 90; lat += step) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 6) pts.push(P([lat, lon]));
    parts.push(...runs(pts).map(line));
  }
  return parts.join("");
}

/** The equator on its own (drawn a touch stronger). */
export function equator(P: Projection) {
  const pts = [];
  for (let lon = -180; lon <= 180; lon += 6) pts.push(P([0, lon]));
  return runs(pts).map(line).join("");
}

/** Coastlines: closed shapes are smoothed as loops when wholly visible, otherwise as open runs. */
export function coasts(P: Projection) {
  const parts: string[] = [];
  for (const [closed, pts] of COASTS) {
    const proj = pts.map((p) => P(p));
    if (closed && proj.every((p) => p.v)) parts.push(smooth(proj, true));
    else parts.push(...runs(closed ? [...proj, proj[0]] : proj).map((r) => smooth(r)));
  }
  return parts.join("");
}

/** The route as points along the great circle, lifted a little above the surface like a flight path. */
export function route(P: Projection, a: LL, b: LL, n: number, lift: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { t, ...P(slerp(a, b, t), lift * Math.sin(Math.PI * t)) };
  });
}

export const routePath = (pts: { x: number; y: number }[]) => smooth(pts);

// Simplified coastlines, [lat, lon] in degrees, for drawing at globe scale, where a point every 100–300 km reads true.
const AFRICA: LL[] = [
  [35.78, -5.81], [35.9, -5.3], [35.2, -2.9], [35.7, -0.6], [36.8, 3.1], [36.9, 6.9], [37.3, 9.9], [36.8, 10.2], [37.1, 11.0],
  [35.8, 10.6], [34.7, 10.8], [33.8, 10.9], [32.9, 13.2], [32.4, 15.1], [31.2, 16.6], [30.4, 19.1], [31.2, 20.0], [32.1, 20.1],
  [32.8, 22.6], [32.1, 23.9], [31.6, 25.2], [31.3, 27.2], [31.2, 29.9], [31.5, 31.0], [31.3, 32.3], [30.0, 32.6], [28.2, 33.2],
  [27.2, 33.8], [25.1, 34.9], [22.0, 36.9], [19.6, 37.2], [17.9, 38.6], [15.6, 39.5], [13.0, 42.6], [11.6, 43.1], [10.4, 45.0],
  [11.3, 49.2], [11.8, 51.3], [10.4, 51.3], [8.0, 49.8], [5.4, 48.5], [2.0, 45.3], [-0.4, 42.5], [-2.3, 40.9], [-4.0, 39.7],
  [-6.8, 39.3], [-10.3, 40.2], [-15.0, 40.7], [-17.9, 36.9], [-19.8, 34.9], [-22.0, 35.3], [-23.9, 35.5], [-25.1, 33.6],
  [-25.9, 32.6], [-26.8, 32.9], [-28.8, 32.1], [-29.9, 31.0], [-31.6, 29.5], [-33.0, 27.9], [-33.9, 25.6], [-34.2, 24.8],
  [-34.2, 22.1], [-34.8, 20.0], [-34.36, 18.47], [-33.9, 18.4], [-32.1, 18.3], [-29.25, 16.87], [-26.6, 15.2], [-22.9, 14.5],
  [-20.0, 13.0], [-17.3, 11.75], [-15.2, 12.1], [-12.6, 13.4], [-8.8, 13.2], [-6.1, 12.4], [-4.8, 11.9], [-3.4, 10.65],
  [-0.6, 8.7], [0.4, 9.4], [2.9, 9.9], [4.0, 9.7], [4.4, 7.1], [4.3, 6.1], [6.4, 3.4], [6.1, 1.2], [5.6, -0.2], [4.74, -2.09],
  [5.3, -4.0], [4.4, -7.7], [6.3, -10.8], [8.5, -13.2], [9.5, -13.7], [11.9, -15.6], [13.45, -16.58], [14.7, -17.4],
  [16.0, -16.5], [18.1, -16.0], [20.8, -17.05], [23.7, -15.9], [26.1, -14.5], [27.9, -12.9], [28.5, -11.3], [29.4, -10.2],
  [30.4, -9.6], [31.5, -9.8], [32.3, -9.2], [33.6, -7.6], [34.0, -6.8], [35.2, -6.15],
];
const MADAGASCAR: LL[] = [
  [-12.0, 49.3], [-13.4, 50.0], [-15.95, 50.2], [-18.15, 49.4], [-21.2, 48.35], [-22.8, 47.8], [-25.0, 47.0], [-25.6, 45.2],
  [-23.35, 43.67], [-21.75, 43.37], [-18.06, 44.03], [-16.2, 44.45], [-15.7, 46.3], [-13.3, 48.3],
];
// Europe's Atlantic, North Sea and Baltic coasts, round Scandinavia to the Kola Peninsula (open: Asia carries on).
const EUROPE_NORTH: LL[] = [
  [36.1, -5.4], [36.0, -5.6], [36.5, -6.3], [37.25, -6.95], [37.02, -8.99], [38.78, -9.5], [39.36, -9.38], [41.1, -8.7],
  [42.2, -8.8], [42.9, -9.3], [43.4, -8.4], [43.79, -7.69], [43.5, -5.7], [43.5, -3.8], [43.3, -2.9], [43.32, -1.98],
  [44.7, -1.2], [45.62, -1.03], [46.2, -1.2], [47.27, -2.2], [47.8, -4.37], [48.33, -4.77], [48.73, -3.98], [48.78, -3.05],
  [48.6, -2.0], [48.84, -1.6], [49.7, -1.9], [49.67, -1.26], [49.28, -0.25], [49.5, 0.1], [49.9, 1.1], [50.52, 1.59],
  [51.0, 1.9], [51.1, 2.6], [51.33, 3.2], [51.44, 3.57], [51.98, 4.12], [52.46, 4.58], [52.96, 4.76], [53.4, 6.2],
  [53.59, 6.67], [53.9, 8.7], [54.3, 8.6], [55.5, 8.4], [55.99, 8.13], [57.12, 8.6], [57.7, 10.6], [57.44, 10.54],
  [56.41, 10.92], [56.15, 10.2], [55.56, 9.75], [54.78, 9.43], [54.32, 10.14], [54.1, 12.1], [54.31, 13.09], [54.1, 14.0],
  [54.18, 15.58], [54.58, 16.86], [54.79, 18.4], [54.4, 18.7], [54.65, 19.9], [55.7, 21.1], [56.5, 21.0], [57.39, 21.56],
  [57.75, 22.6], [56.95, 24.1], [58.38, 24.5], [59.4, 24.7], [59.46, 28.04], [59.9, 30.3], [60.47, 26.95], [60.2, 25.0],
  [59.82, 22.95], [60.4, 22.2], [61.48, 21.8], [63.1, 21.6], [63.84, 23.13], [65.0, 25.4], [65.85, 24.15], [65.6, 22.1],
  [64.7, 21.2], [63.8, 20.3], [62.63, 17.94], [61.7, 17.1], [60.7, 17.2], [59.76, 18.7], [59.3, 18.1], [58.59, 16.2],
  [57.76, 16.64], [56.7, 16.4], [56.16, 15.59], [55.43, 13.82], [55.6, 13.0], [56.05, 12.69], [57.7, 11.9], [58.94, 11.17],
  [59.05, 10.03], [58.15, 8.0], [57.98, 7.05], [58.97, 5.73], [60.4, 5.3], [61.94, 5.11], [62.47, 6.15], [63.3, 8.3],
  [64.86, 11.24], [66.0, 12.4], [67.3, 14.4], [68.4, 15.8], [69.6, 18.9], [70.66, 23.68], [71.17, 25.78], [70.37, 31.1],
  [69.2, 33.4], [68.5, 38.5], [66.8, 41.0],
];
// Europe's Mediterranean coast, Gibraltar to Istanbul.
const EUROPE_SOUTH: LL[] = [
  [36.1, -5.4], [36.7, -4.4], [36.8, -2.5], [37.6, -0.98], [38.3, -0.5], [38.73, 0.23], [39.5, -0.3], [40.7, 0.9], [41.4, 2.2],
  [42.32, 3.32], [43.4, 3.7], [43.3, 5.4], [43.1, 5.9], [43.7, 7.3], [44.4, 8.9], [44.1, 9.8], [43.55, 10.3], [42.44, 11.2],
  [41.73, 12.28], [41.21, 13.57], [40.8, 14.2], [40.25, 14.9], [39.36, 16.04], [38.11, 15.65], [37.92, 16.06], [38.82, 16.62],
  [39.08, 17.13], [39.75, 16.5], [40.5, 17.2], [39.8, 18.36], [40.64, 17.94], [41.1, 16.9], [41.9, 16.18], [42.46, 14.21],
  [43.6, 13.5], [44.06, 12.57], [44.95, 12.5], [45.4, 12.3], [45.7, 13.8], [44.87, 13.85], [45.3, 14.4], [44.1, 15.2],
  [43.5, 16.4], [42.6, 18.1], [42.09, 19.1], [41.3, 19.4], [40.4, 19.5], [39.87, 20.0], [38.25, 21.73], [37.25, 21.67],
  [36.9, 21.7], [36.39, 22.48], [36.44, 23.2], [37.57, 22.8], [37.94, 23.64], [37.65, 24.02], [38.46, 23.6], [39.36, 22.94],
  [40.6, 22.9], [39.95, 23.9], [40.94, 24.41], [40.85, 25.87], [40.4, 26.6], [41.0, 28.9],
];
// Asia's western edge: the Levant and Turkey, the Black Sea, then the Sinai, Arabia and the Gulf to Karachi.
const BLACK_SEA: LL[] = [
  [41.2, 29.1], [41.45, 31.8], [42.03, 35.15], [41.3, 36.3], [41.0, 39.7], [41.6, 41.6], [43.0, 41.0], [44.7, 37.8],
  [45.2, 36.5], [45.2, 35.4], [44.5, 34.2], [44.6, 33.5], [45.2, 33.4], [46.0, 33.0], [46.6, 31.5], [46.5, 30.7],
  [45.2, 29.7], [44.2, 28.6], [43.2, 27.9], [42.5, 27.5], [41.6, 28.1], [41.2, 29.1],
];
const LEVANT: LL[] = [
  [31.3, 32.3], [31.13, 33.8], [31.5, 34.45], [32.1, 34.8], [32.8, 35.0], [33.9, 35.5], [34.4, 35.8], [35.5, 35.8], [36.6, 36.2],
  [36.8, 34.6], [36.0, 32.8], [36.9, 30.7], [36.2, 29.6], [36.85, 28.27], [37.03, 27.43], [38.3, 26.3], [39.3, 26.7],
  [40.15, 26.4], [41.0, 28.9],
];
const ARABIA: LL[] = [
  [30.0, 32.6], [27.9, 34.3], [29.5, 34.95], [29.3, 34.95], [27.35, 35.7], [26.24, 36.45], [24.09, 38.06], [21.5, 39.2],
  [19.13, 41.08], [16.89, 42.55], [14.8, 42.95], [12.6, 43.4], [12.8, 45.0], [14.54, 49.13], [15.8, 52.2], [17.0, 54.1],
  [19.0, 57.8], [20.7, 58.9], [22.53, 59.8], [23.6, 58.6], [24.35, 56.7], [26.38, 56.35], [25.27, 55.3], [24.1, 52.7],
  [24.7, 50.8], [26.15, 51.25], [25.28, 51.53], [26.43, 50.1], [27.0, 49.66], [28.43, 48.5], [29.4, 48.0], [29.95, 48.6],
  [28.97, 50.84], [27.47, 52.6], [27.2, 56.3], [25.64, 57.77], [25.12, 62.3], [24.8, 67.0],
];
const BRITAIN: LL[] = [
  [50.1, -5.7], [50.37, -4.14], [50.6, -3.4], [50.71, -1.98], [50.73, -0.79], [50.74, 0.25], [51.1, 1.3], [51.38, 1.45],
  [51.5, 0.6], [51.94, 1.29], [52.48, 1.75], [52.93, 1.3], [52.8, 0.35], [53.58, 0.12], [54.12, -0.08], [54.62, -1.07],
  [55.02, -1.42], [55.67, -1.8], [56.0, -2.52], [55.97, -3.17], [56.28, -2.58], [57.1, -2.1], [57.5, -1.78], [57.72, -3.28],
  [57.5, -4.2], [58.64, -3.03], [58.62, -5.0], [57.73, -5.69], [56.73, -6.23], [56.42, -5.47], [55.3, -5.8], [55.95, -4.76],
  [54.63, -4.86], [54.9, -3.5], [54.51, -3.64], [53.82, -3.05], [53.41, -3.0], [53.31, -4.63], [52.8, -4.75], [52.1, -4.68],
  [51.9, -5.31], [51.6, -3.95], [51.5, -3.2], [51.2, -3.48], [51.02, -4.52], [50.42, -5.08],
];
const IRELAND: LL[] = [
  [55.4, -7.4], [55.23, -6.15], [54.66, -5.67], [54.04, -6.19], [53.3, -6.1], [52.17, -6.36], [51.8, -8.29], [51.45, -9.82],
  [52.1, -10.46], [52.56, -9.93], [53.27, -9.05], [53.4, -10.23], [54.23, -10.0], [54.27, -8.47], [54.63, -8.45], [55.16, -8.28],
];
const ISLANDS: LL[][] = [
  [[38.02, 12.5], [38.2, 13.3], [38.2, 15.6], [37.5, 15.1], [36.7, 15.1], [37.06, 14.25], [37.65, 12.59]], // Sicily
  [[41.2, 9.4], [40.9, 9.7], [39.4, 9.6], [39.2, 9.1], [38.87, 8.64], [39.9, 8.5], [40.56, 8.3], [40.94, 8.22]], // Sardinia
  [[43.0, 9.4], [42.7, 9.45], [41.4, 9.2], [41.9, 8.7], [42.57, 8.76]], // Corsica
  [[35.52, 24.02], [35.3, 25.1], [35.2, 26.1], [35.0, 25.8], [34.95, 24.7], [35.2, 23.6]], // Crete
  [[35.1, 32.3], [35.2, 33.4], [35.7, 34.6], [34.9, 33.6], [34.6, 33.0], [34.7, 32.4]], // Cyprus
];
// The eastern edge of South America, just over the western limb.
const SOUTH_AMERICA: LL[] = [
  [5.8, -55.2], [4.9, -52.3], [1.8, -50.0], [-1.4, -48.5], [-2.5, -44.3], [-2.9, -41.8], [-3.7, -38.5], [-5.2, -35.5],
  [-8.1, -34.9], [-10.9, -37.0], [-13.0, -38.5], [-17.9, -39.3], [-20.3, -40.3], [-23.0, -43.2], [-23.9, -46.3],
];

const COASTS: [closed: boolean, pts: LL[]][] = [
  [true, AFRICA],
  [true, MADAGASCAR],
  [false, EUROPE_NORTH],
  [false, EUROPE_SOUTH],
  [false, BLACK_SEA],
  [false, LEVANT],
  [false, ARABIA],
  [true, BRITAIN],
  [true, IRELAND],
  ...ISLANDS.map((i) => [true, i] as [boolean, LL[]]),
  [false, SOUTH_AMERICA],
];
