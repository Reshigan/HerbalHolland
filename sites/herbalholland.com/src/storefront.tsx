// The storefront at dusk, the home page's opening picture, drawn after the owner's store concept: a charcoal front
// with warm oak and dry stone; the round sign with the orange ring and our mark (it switches on as the page opens);
// the African geometric panel beside the door (the site's pattern, larger); through the glass, oak shelves under warm
// track lights and a cognac leather chair; proteas and aloes in terracotta pots at the door. No people, no products
// anyone could name. Three layers in one box (1000 × 900): the building, the sign's light (its own layer, so it can
// switch on without repainting the rest) and the pots in front. Colours come from classes in site.css.
import { BRAND, HOME } from "../content";
import { TilePattern, cx, r0, rng } from "./art";

const WIN = { x: 350, y: 186, w: 650, h: 646 };
const SIGN = { x: 202, y: 322, r: 90 };

/** Dry stone: irregular courses of flat stones, three tones. */
function Stones() {
  const r = rng(11);
  const out: React.ReactNode[] = [];
  for (let y = 172; y < 830; ) {
    const h = 22 + Math.round(r() * 14);
    for (let x = -r0(r() * 20); x < 64; ) {
      const w = 24 + Math.round(r() * 26);
      const x0 = Math.max(0, x);
      const tone = 1 + Math.floor(r() * 3);
      if (Math.min(x + w, 70) - x0 > 8) out.push(<rect key={`${x}-${y}`} className={`sf-s${tone}`} x={x0 + 1.5} y={y + 1.5} width={Math.min(x + w, 70) - x0 - 3} height={Math.min(h, 830 - y) - 3} rx="3" />);
      x += w;
    }
    y += h;
  }
  return <g>{out}</g>;
}

/** Products on one shelf, standing on `y` between x0 and x1: pouches, jars, bottles and boxes. */
function Goods({ x0, x1, y, seed }: { x0: number; x1: number; y: number; seed: number }) {
  const r = rng(seed);
  const out: React.ReactNode[] = [];
  let x = x0 + 5;
  for (let i = 0; ; i++) {
    const k = Math.floor(r() * 4);
    const w = [22, 17, 12, 27][k] + r0(r() * 5);
    const h = [46, 34, 50, 28][k] + r0(r() * 10);
    if (x + w > x1 - 3) break;
    const t = y - h;
    if (k === 0)
      out.push(
        <path key={i} className="pa-kraft" d={`M${x} ${y}V${t + 6}q0-6 6-6h${w - 12}q6 0 6 6V${y}z`} />,
        <rect key={`${i}b`} className="pa-org" x={x + 4} y={t + 16} width={w - 8} height="6" />,
      );
    else if (k === 1) out.push(<rect key={i} className="pa-cream" x={x} y={t + 7} width={w} height={h - 7} rx="3" />, <rect key={`${i}b`} className="pa-char" x={x - 1} y={t} width={w + 2} height="8" rx="2" />);
    else if (k === 2)
      out.push(<rect key={i} className="pa-amber" x={x} y={t + 14} width={w} height={h - 14} rx="3" />, <rect key={`${i}b`} className="pa-char" x={x + 3} y={t} width={w - 6} height="15" rx="2" />);
    else out.push(<rect key={i} className="pa-char" x={x} y={t} width={w} height={h} />, <rect key={`${i}b`} className="pa-org" x={x} y={t + 8} width={w} height="5" />);
    x += w + 4 + r0(r() * 5);
  }
  return <>{out}</>;
}

/** An oak shelving unit: back, uprights every `bay`, shelves every `step`, and goods on each shelf. */
function Shelves({ x0, x1, y0, y1, step, bays, seed }: { x0: number; x1: number; y0: number; y1: number; step: number; bays: number; seed: number }) {
  const bw = (x1 - x0) / bays;
  const shelves = [];
  for (let y = y0 + step; y <= y1; y += step) shelves.push(y);
  return (
    <g>
      <rect className="sf-shelfback" x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
      {shelves.map((y, i) =>
        Array.from({ length: bays }, (_, b) => <Goods key={`${i}-${b}`} x0={x0 + b * bw + 6} x1={x0 + (b + 1) * bw - 2} y={y} seed={seed + i * 7 + b} />),
      )}
      {Array.from({ length: bays + 1 }, (_, b) => (
        <rect key={`u${b}`} className="pa-oak" x={r0(x0 + b * bw) - 4} y={y0} width="8" height={y1 - y0 + 8} />
      ))}
      {[y0, ...shelves].map((y) => (
        <rect key={`s${y}`} className="pa-oak" x={x0 - 4} y={y} width={x1 - x0 + 8} height="8" />
      ))}
    </g>
  );
}

/** A terracotta pot, standing on (x, y), `h` tall and `w` across the rim. */
function Pot({ x, y, h, w }: { x: number; y: number; h: number; w: number }) {
  const t = y - h;
  const b = w * 0.36;
  return (
    <g>
      <path className="pa-terra" d={`M${x - w / 2 + 4} ${t + 14}L${x - b} ${y}H${x + b}L${x + w / 2 - 4} ${t + 14}z`} />
      <path className="pa-terra2" d={`M${x + w * 0.1} ${t + 14}L${x + b * 0.45} ${y}H${x + b}L${x + w / 2 - 4} ${t + 14}z`} />
      <rect className="pa-terra3" x={x - w / 2} y={t} width={w} height="16" rx="4" />
    </g>
  );
}

/** An aloe: a rosette of thick leaves from (x, y), with a spike of orange flowers when `spike`. */
function Aloe({ x, y, s, spike }: { x: number; y: number; s: number; spike?: boolean }) {
  const leaves = [-74, -52, -30, -12, 8, 26, 46, 68];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {spike && (
        <g>
          <path className="pa-stalk" d="M2 -40C4 -110 10 -170 14 -212" />
          <path className="pa-bloom" d="M14 -268c7 12 9 38 3 58h-7c-5-20-3-46 4-58z" />
          <path className="pa-bloom2" d="M8 -250h11M7 -238h13M7 -226h13" />
        </g>
      )}
      {leaves.map((a, i) => (
        <path key={a} className={i % 2 ? "pa-sage" : "pa-sage2"} transform={`rotate(${a})`} d={`M-9 0C-8-${40 + (i % 3) * 8} -3-${88 + (i % 3) * 14} 0-${112 + (i % 3) * 16}C3-${88 + (i % 3) * 14} 8-${40 + (i % 3) * 8} 9 0z`} />
      ))}
    </g>
  );
}

/** A protea bush: leafy stems with a king-protea head on each (x, y offsets in `heads`). */
function Protea({ x, y, s, heads }: { x: number; y: number; s: number; heads: [number, number][] }) {
  const petals = [-72, -48, -24, 0, 24, 48, 72];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {heads.map(([hx, hy], i) => (
        <g key={i}>
          <path className="pa-stalk" d={`M0 0Q${hx * 0.3} ${hy * 0.5} ${hx} ${hy}`} />
          {[0.35, 0.6].map((f) => (
            <ellipse key={f} className="pa-sage" cx={hx * f + (i % 2 ? 9 : -9)} cy={hy * f} rx="7" ry="17" transform={`rotate(${i % 2 ? 30 : -30} ${hx * f} ${hy * f})`} />
          ))}
          <g transform={`translate(${hx} ${hy})`}>
            {petals.map((a) => (
              <path key={a} className="pa-pro" transform={`rotate(${a} 0 4)`} d="M0 4C-7-6-8-22 0-34C8-22 7-6 0 4z" />
            ))}
            {petals.slice(1, -1).map((a) => (
              <path key={a} className="pa-pro2" transform={`rotate(${a * 0.8} 0 4) scale(.72)`} d="M0 4C-7-6-8-22 0-34C8-22 7-6 0 4z" />
            ))}
            <ellipse className="pa-pro3" cx="0" cy="-10" rx="11" ry="13" />
          </g>
        </g>
      ))}
    </g>
  );
}

/** The sign's mark: the four petals and the hub (the mark's own sails, larger). */
const SignMark = ({ className }: { className: string }) => (
  <g className={className} transform={`translate(${SIGN.x} ${SIGN.y - 28}) scale(1.5)`} fill="none" strokeLinecap="round" strokeLinejoin="round">
    {[-45, 45, 135, 225].map((a) => (
      <use key={a} href="#petal" transform={`rotate(${a})`} strokeWidth="3.4" />
    ))}
    <circle r="3.4" strokeWidth="2.4" />
  </g>
);

const SignWords = ({ className }: { className: string }) => {
  const [a, b] = BRAND.name.split(" ");
  return (
    <g className={className} textAnchor="middle">
      <text className="sf-t1" x={SIGN.x} y={SIGN.y + 40}>
        {a}
      </text>
      <text className="sf-t2" x={SIGN.x} y={SIGN.y + 63}>
        {b}
      </text>
    </g>
  );
};

export function Storefront({ className }: { className?: string }) {
  return (
    <div className={cx("sf", className)} role="img" aria-label={HOME.hero.art}>
      <svg className="sf__base" viewBox="0 0 1000 900" aria-hidden="true" focusable="false">
        <defs>
          <TilePattern id="sf-pat" scale={1.8} />
          <clipPath id="sf-win">
            <rect x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} />
          </clipPath>
          <clipPath id="sf-pier">
            <rect x="0" y="172" width="334" height="660" />
          </clipPath>
          <linearGradient id="sf-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="st-back0" />
            <stop offset=".55" className="st-back1" />
            <stop offset="1" className="st-back2" />
          </linearGradient>
          <linearGradient id="sf-cone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="st-cone0" />
            <stop offset="1" className="st-cone1" />
          </linearGradient>
          <linearGradient id="sf-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="st-floor0" />
            <stop offset="1" className="st-floor1" />
          </linearGradient>
          <radialGradient id="sf-wash" cx=".5" cy="0" r="1">
            <stop offset="0" className="st-wash0" />
            <stop offset="1" className="st-wash1" />
          </radialGradient>
          <radialGradient id="sf-pool">
            <stop offset="0" className="st-pool0" />
            <stop offset="1" className="st-pool1" />
          </radialGradient>
          <radialGradient id="sf-glow">
            <stop offset=".45" className="st-sg0" />
            <stop offset="1" className="st-sg1" />
          </radialGradient>
        </defs>
        {/* The building, the oak fascia and the soffit with its downlights. */}
        <rect className="sf-wall" x="0" y="34" width="1000" height="812" />
        <rect className="sf-cap" x="0" y="34" width="1000" height="10" />
        <rect className="sf-oak" x="0" y="72" width="1000" height="84" />
        <path className="sf-groove" d="M0 93h1000M0 114h1000M0 135h1000M140 72v21M520 72v21M860 72v21M330 93v21M700 93v21M60 114v21M450 114v21M910 114v21M250 135v21M620 135v21" />
        <rect className="sf-soffit" x="0" y="156" width="1000" height="16" />
        {[36, 202, 520, 840].map((x) => (
          <ellipse key={x} className="sf-lamp" cx={x} cy="167" rx="10" ry="3" />
        ))}
        {/* Stone pier, and the pillar with the sign and the panel. */}
        <rect className="sf-mortar" x="0" y="172" width="70" height="660" />
        <Stones />
        <rect className="sf-pillar" x="70" y="172" width="264" height="660" />
        <g clipPath="url(#sf-pier)">
          <ellipse cx="36" cy="172" rx="60" ry="220" fill="url(#sf-wash)" />
          <ellipse cx="202" cy="172" rx="150" ry="300" fill="url(#sf-wash)" />
        </g>
        <circle className="sf-plate" cx={SIGN.x} cy={SIGN.y} r={SIGN.r + 12} />
        <circle className="sf-ring" cx={SIGN.x} cy={SIGN.y} r={SIGN.r} />
        <SignMark className="sf-mark" />
        <SignWords className="sf-words" />
        <rect className="pa-oak" x="106" y="452" width="192" height="346" rx="4" />
        <rect x="114" y="460" width="176" height="330" fill="url(#sf-pat)" />
        {/* The window: inside, warm light on oak shelves, the counter and a leather chair. */}
        <rect className="sf-frame" x="334" y="172" width="666" height="660" />
        <g clipPath="url(#sf-win)">
          <rect x={WIN.x} y={WIN.y} width={WIN.w} height="580" fill="url(#sf-back)" />
          <rect className="sf-ceil" x={WIN.x} y={WIN.y} width={WIN.w} height="48" />
          <rect className="sf-track" x={WIN.x} y="208" width={WIN.w} height="4" />
          <Shelves x0={376} x1={640} y0={262} y1={574} step={78} bays={2} seed={3} />
          <rect className="sf-oak3" x="372" y="612" width="272" height="150" />
          <path className="sf-groove" d="M508 616v142M418 686h44M554 686h44" />
          <Shelves x0={700} x1={986} y0={262} y1={496} step={78} bays={2} seed={41} />
          <rect className="sf-oak3" x="696" y="534" width="294" height="40" />
          <rect className="sf-counter" x="706" y="584" width="300" height="178" />
          <path className="sf-groove" d="M726 590v168M746 590v168M766 590v168M786 590v168M806 590v168M826 590v168M846 590v168M866 590v168M886 590v168M906 590v168M926 590v168M946 590v168M966 590v168M986 590v168" />
          <rect className="sf-glasstop" x="700" y="574" width="306" height="10" />
          <rect x={WIN.x} y="762" width={WIN.w} height="70" fill="url(#sf-floor)" />
          {[430, 560, 700, 830, 950].map((x, i) => (
            <g key={x}>
              <path d={`M${x} 228L${x - 95} 700H${x + 95}z`} fill="url(#sf-cone)" />
              <g transform={`translate(${x} 212) rotate(${i % 2 ? 14 : -14})`}>
                <rect className="sf-spot" x="-6" y="0" width="12" height="18" rx="3" />
                <circle className="sf-lens" cy="18" r="5" />
              </g>
            </g>
          ))}
          {/* The chair and a side table. */}
          <rect className="sf-leather2" x="440" y="648" width="150" height="104" rx="26" />
          <rect className="sf-leather" x="430" y="726" width="170" height="46" rx="16" />
          <rect className="sf-leather2" x="418" y="694" width="36" height="84" rx="14" />
          <rect className="sf-leather2" x="576" y="694" width="36" height="84" rx="14" />
          <path className="sf-hi" d="M458 672q57-14 114 0" />
          <path className="sf-metal" d="M434 778v36M596 778v36M434 800h162" />
          <ellipse className="pa-oak" cx="652" cy="744" rx="26" ry="6" />
          <rect className="sf-metal2" x="649" y="744" width="6" height="70" />
          <path className="sf-glass" d="M600 186h56L470 832h-56zM868 186h28L776 832h-28z" />
        </g>
        <rect className="sf-frame" x="664" y="186" width="10" height="646" />
        {/* The step and the pavement, lit from the window. */}
        <rect className="sf-plinth" x="0" y="832" width="1000" height="14" />
        <rect className="sf-pave" x="0" y="846" width="1000" height="54" />
        <path className="sf-joint" d="M90 846v54M270 846v54M450 846v54M630 846v54M810 846v54" />
        <ellipse cx="670" cy="862" rx="380" ry="30" fill="url(#sf-pool)" />
      </svg>
      <svg className="sf__on" viewBox="0 0 1000 900" aria-hidden="true" focusable="false">
        <circle cx={SIGN.x} cy={SIGN.y} r="190" fill="url(#sf-glow)" />
        <circle className="sf-ring sf-ring--on" cx={SIGN.x} cy={SIGN.y} r={SIGN.r} />
        <SignMark className="sf-mark sf-mark--on" />
        <SignWords className="sf-words sf-words--on" />
      </svg>
      <svg className="sf__front" viewBox="0 0 1000 900" aria-hidden="true" focusable="false">
        <Aloe x={52} y={772} s={1.05} spike />
        <Pot x={52} y={898} h={130} w={100} />
        <Protea x={150} y={818} s={1} heads={[[-26, -64], [8, -96], [34, -52]]} />
        <Pot x={150} y={898} h={84} w={86} />
        <Aloe x={250} y={840} s={0.62} />
        <Pot x={250} y={898} h={62} w={64} />
        <Protea x={742} y={808} s={1.05} heads={[[-20, -78], [22, -58]]} />
        <Pot x={742} y={898} h={94} w={92} />
        <Aloe x={936} y={776} s={1.1} spike />
        <Pot x={936} y={898} h={126} w={104} />
      </svg>
    </div>
  );
}
