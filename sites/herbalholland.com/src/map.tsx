// The store map: South Africa's nine provinces (real boundaries, from ./za), Lesotho and Eswatini, and a pin for every
// store in ../facts. Provinces with a store are warmed; each pin is labelled with its store's name. A store is one
// line in facts.ts, so a new store puts itself on the map.
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { MAP, fill } from "../content";
import { FACTS, shortDay, storeProvinces } from "../facts";
import { cx } from "./art";
import { NEIGHBOUR_SHAPES, PROVINCE_SHAPES, ZA_BOX, project } from "./za";

type Code = ProvinceCode | keyof typeof NEIGHBOUR_SHAPES;
/** Where a name sits, where Natural Earth's label point would crowd a neighbour's name or a store's (legibility only;
 * the shapes are untouched). */
const NAME_AT: Partial<Record<Code, readonly [x: number, y: number]>> = { MP: [838, 248], NW: [525, 300], LS: [692, 556], SZ: [902, 320] };
const nameAt = (k: Code, [x, y]: readonly [number, number], dy = 0) => NAME_AT[k] ?? ([x, y + dy] as const);

export function ZaMap({ id, className }: { id: string; className?: string }) {
  const lit = new Set(storeProvinces());
  const pins = FACTS.stores.map((s) => ({ s, at: project(s.lat, s.lon) }));
  // Close neighbours label away from each other: the eastern one to the right, the other to the left.
  const side = (i: number) => {
    const [x, y] = pins[i].at;
    const near = pins.filter((p, j) => j !== i && Math.hypot(p.at[0] - x, p.at[1] - y) < 140);
    return near.some((p) => p.at[0] > x) ? "l" : "r";
  };
  const statuses = [...new Set(FACTS.stores.map((s) => s.status))];
  const days = [...new Set(FACTS.stores.filter((s) => s.status === "opening").map((s) => s.opens))];
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
          {pins.map(({ s, at: [x, y] }, i) => (
            <g key={s.key} className={cx("za-pin", `za-pin--${s.status}`)} transform={`translate(${Math.round(x)} ${Math.round(y)})`}>
              <circle className="za-pin__pulse" r="14" />
              <circle className="za-pin__dot" r="9" />
              <text className="za-pin__name" x={side(i) === "l" ? -18 : 18} y="7" textAnchor={side(i) === "l" ? "end" : "start"}>
                {s.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <figcaption className="za__key">
        {statuses.includes("opening") &&
          days.map((d) => (
            <span key={d} className="za__k za__k--opening">
              {fill(MAP.legend.opening, { date: shortDay(d) + " " + d.slice(0, 4) })}
            </span>
          ))}
        {statuses.includes("open") && <span className="za__k za__k--open">{MAP.legend.open}</span>}
      </figcaption>
    </figure>
  );
}
