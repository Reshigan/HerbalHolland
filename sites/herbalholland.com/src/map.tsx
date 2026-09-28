// The store map: South Africa's nine provinces (real boundaries, from ./za), Lesotho and Eswatini, and a pin for every
// store in ../facts — a solid pin for a store that's open, a ring for one that's still to open — with a key that names
// them by town (so neither shape nor colour is the only signal, and close neighbours never crowd each other's names).
// A store is one line in facts.ts, so a new store puts itself on the map. Stores a few kilometres apart
// (Pietermaritzburg and Hilton) are nudged apart just enough to tell the pins apart.
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { MAP, fill } from "../content";
import { FACTS, listOf, shortDay, type Store } from "../facts";
import { cx } from "./art";
import { NEIGHBOUR_SHAPES, PROVINCE_SHAPES, ZA_BOX, project } from "./za";

type Code = ProvinceCode | keyof typeof NEIGHBOUR_SHAPES;
/** Where a name sits, where Natural Earth's label point would crowd a neighbour's name or a store's (legibility only;
 * the shapes are untouched). */
const NAME_AT: Partial<Record<Code, readonly [x: number, y: number]>> = { MP: [838, 248], NW: [525, 300], LS: [692, 556], SZ: [902, 320] };
const nameAt = (k: Code, [x, y]: readonly [number, number], dy = 0) => NAME_AT[k] ?? ([x, y + dy] as const);

/** A pin's radius, and how far apart pins are kept (map units), so each one reads on its own. */
const R = 10;
const GAP = 27;
type Pin = { s: Store; x: number; y: number };

/** Pins in map units, pushed apart (a few gentle passes) where two would overlap. */
function pinsFor(stores: readonly Store[]): Pin[] {
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
        if (d >= GAP) continue;
        if (d < 0.01) (dx = 1), (dy = 0);
        const push = (GAP - d) / 2 / (d || 1);
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

export function ZaMap({ id, className }: { id: string; className?: string }) {
  const lit = new Set(FACTS.stores.map((s) => s.province));
  const pins = pinsFor(FACTS.stores);
  const open = FACTS.stores.filter((s) => s.status === "open");
  const days = [...new Set(FACTS.stores.filter((s) => s.status === "opening" && s.opens).map((s) => s.opens!))].sort();
  const towns = (stores: readonly Store[]) => listOf(stores.map((s) => s.city));
  return (
    <figure className={cx("za", className)}>
      <svg className="za__map" viewBox={`0 0 ${ZA_BOX.w} ${ZA_BOX.h}`} role="img" aria-labelledby={`${id}-t`} focusable="false">
        <title id={`${id}-t`}>{MAP.caption}</title>
        {(Object.keys(NEIGHBOUR_SHAPES) as (keyof typeof NEIGHBOUR_SHAPES)[]).map((k) => (
          <path key={k} className="za__nb" d={NEIGHBOUR_SHAPES[k].d} />
        ))}
        {(Object.keys(PROVINCE_SHAPES) as ProvinceCode[]).map((k) => (
          <path key={k} className={cx("za__p", lit.has(k) && "za__p--on")} d={PROVINCE_SHAPES[k].d} />
        ))}
        <g className="za__names" aria-hidden="true">
          {(Object.keys(PROVINCE_SHAPES) as ProvinceCode[]).map((k) => (
            <text key={k} className={cx(lit.has(k) && "on")} x={nameAt(k, PROVINCE_SHAPES[k].label)[0]} y={nameAt(k, PROVINCE_SHAPES[k].label)[1]}>
              {PROVINCES[k]}
            </text>
          ))}
          {(Object.keys(NEIGHBOUR_SHAPES) as (keyof typeof NEIGHBOUR_SHAPES)[]).map((k) => (
            <text key={k} className="za__nbname" x={nameAt(k, NEIGHBOUR_SHAPES[k].label, 6)[0]} y={nameAt(k, NEIGHBOUR_SHAPES[k].label, 6)[1]}>
              {MAP.neighbours[k]}
            </text>
          ))}
        </g>
        <g aria-hidden="true">
          {pins.map(({ s, x, y }) => (
            <g key={s.key} className={cx("za-pin", `za-pin--${s.status}`)} transform={`translate(${Math.round(x)} ${Math.round(y)})`}>
              {s.status === "opening" && <circle className="za-pin__pulse" r={R + 4} />}
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
