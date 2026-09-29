// The store map: a pin for every store in ../facts — a solid pin for a store that's open, a ring for one that's still
// to open — with a key that names them by town (so neither shape nor colour is the only signal). Until stores are in
// three or more provinces, the map is only the provinces with a store (for now KwaZulu-Natal, with the neighbours it
// borders); after that, all nine (real boundaries, from ./za). A store is one line in facts.ts, so a new store puts
// itself on the map, and the map widens by itself. Stores a few kilometres apart are nudged apart just enough to tell
// the pins apart. `here` marks one store on its own page.
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { MAP, fill } from "../content";
import { FACTS, listOf, provinceNames, shortDay, storeProvinces, type Store } from "../facts";
import { cx } from "./art";
import { NEIGHBOUR_SHAPES, PROVINCE_SHAPES, ZA_BOX, bbox, project } from "./za";

type Code = ProvinceCode | keyof typeof NEIGHBOUR_SHAPES;
/** Where a name sits on the national map, where Natural Earth's label point would crowd a neighbour's name or a store's. */
const NAME_AT: Partial<Record<Code, readonly [x: number, y: number]>> = { MP: [838, 248], NW: [525, 300], LS: [692, 556], SZ: [902, 320] };
const nameAt = (k: Code, [x, y]: readonly [number, number], dy = 0) => NAME_AT[k] ?? ([x, y + dy] as const);

/** A pin's radius, and how far apart pins are kept (map units), so each one reads on its own. */
type Pin = { s: Store; x: number; y: number };

/** Pins in map units, pushed apart (a few gentle passes) where two would overlap. */
function pinsFor(stores: readonly Store[], gap: number): Pin[] {
  const pins = stores.map((s) => {
    const [x, y] = project(s.lat, s.lon);
    return { s, x, y };
  });
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < pins.length; i++)
      for (let j = i + 1; j < pins.length; j++) {
        const a = pins[i];
        const b = pins[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.01) (dx = 1), (dy = 0);
        const push = (gap - d) / 2 / (d || 1);
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    if (!moved) break;
  }
  return pins;
}

/** Neighbouring countries drawn on the province map: those whose box touches a lit province's. */
const touching = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function ZaMap({ id, here, className }: { id: string; here?: string; className?: string }) {
  const lit = storeProvinces();
  const national = lit.length >= 3;
  const litSet = new Set(lit);
  // The view: the whole country, or the lit provinces' boxes with a margin, in the map's own units.
  let view = { x: 0, y: 0, w: ZA_BOX.w, h: ZA_BOX.h };
  let neighbours = Object.keys(NEIGHBOUR_SHAPES) as (keyof typeof NEIGHBOUR_SHAPES)[];
  if (!national) {
    const boxes = lit.map((k) => bbox(PROVINCE_SHAPES[k].d));
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.max(...boxes.map((b) => b.y + b.h));
    const m = 40;
    view = { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
    neighbours = neighbours.filter((k) => touching(view, bbox(NEIGHBOUR_SHAPES[k].d)));
  }
  // Pins and type scale with the view, so a province map isn't a country map blown up.
  const k = national ? 1 : Math.max(0.42, view.w / ZA_BOX.w);
  const R = 10 * k;
  const pins = pinsFor(FACTS.stores, 27 * k);
  const open = FACTS.stores.filter((s) => s.status === "open");
  const days = [...new Set(FACTS.stores.filter((s) => s.status === "opening" && s.opens).map((s) => s.opens!))].sort();
  const towns = (stores: readonly Store[]) => listOf(stores.map((s) => s.city));
  const caption = national ? MAP.caption.national : fill(MAP.caption.provinces, { provinces: provinceNames(lit) });
  const shown = national ? (Object.keys(PROVINCE_SHAPES) as ProvinceCode[]) : lit;
  return (
    <figure className={cx("za", !national && "za--province", className)}>
      <svg className="za__map" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img" aria-labelledby={`${id}-t`} focusable="false">
        <title id={`${id}-t`}>{caption}</title>
        {neighbours.map((n) => (
          <path key={n} className="za__nb" d={NEIGHBOUR_SHAPES[n].d} />
        ))}
        {shown.map((p) => (
          <path key={p} className={cx("za__p", litSet.has(p) && "za__p--on")} d={PROVINCE_SHAPES[p].d} />
        ))}
        <g className="za__names" aria-hidden="true">
          {shown.map((p) => (
            <text key={p} className={cx(litSet.has(p) && "on")} x={nameAt(p, PROVINCE_SHAPES[p].label)[0]} y={nameAt(p, PROVINCE_SHAPES[p].label)[1]} fontSize={16 * k}>
              {PROVINCES[p]}
            </text>
          ))}
          {neighbours.map((n) => (
            <text key={n} className="za__nbname" x={nameAt(n, NEIGHBOUR_SHAPES[n].label, 6)[0]} y={nameAt(n, NEIGHBOUR_SHAPES[n].label, 6)[1]} fontSize={16 * k}>
              {MAP.neighbours[n]}
            </text>
          ))}
        </g>
        <g aria-hidden="true">
          {pins.map(({ s, x, y }) => (
            <g key={s.key} className={cx("za-pin", `za-pin--${s.status}`, s.key === here && "za-pin--here")} transform={`translate(${Math.round(x)} ${Math.round(y)})`}>
              {(s.status === "opening" || s.key === here) && <circle className="za-pin__pulse" r={R + 4 * k} />}
              <circle className="za-pin__dot" r={R} />
            </g>
          ))}
        </g>
      </svg>
      <figcaption className="za__key">
        {open.length > 0 && (
          <span className="za__k za__k--open">
            <b>{MAP.legend.open}</b> {towns(open)}
          </span>
        )}
        {days.map((d) => (
          <span key={d} className="za__k za__k--opening">
            <b>{fill(MAP.legend.opening, { date: `${shortDay(d)} ${d.slice(0, 4)}` })}</b> {towns(FACTS.stores.filter((s) => s.status === "opening" && s.opens === d))}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
