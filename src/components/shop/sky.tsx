// The landscape from herbalholland.com, drawn once and small: a sky (gold, dusk or night), a few stars, the rolling
// hills of KwaZulu-Natal in silhouette and one windmill on the ridge — the hero background of the storefront's home
// and category pages. Pure SVG and CSS gradients: nothing to load, nothing to hydrate.
import { Mark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

export type SkyTime = "gold" | "dusk" | "night";

// The same stars every render (seeded once), in a 1600 × 600 sky.
const STARS = [
  [120, 80, 1.6], [260, 40, 1.1], [410, 130, 1.4], [520, 60, 0.9], [690, 100, 1.8], [800, 30, 1.2], [930, 150, 1.0], [1050, 70, 1.5],
  [1180, 40, 1.1], [1310, 120, 1.7], [1440, 60, 1.0], [1530, 160, 1.3], [180, 210, 0.9], [340, 260, 1.2], [620, 230, 1.0], [760, 280, 1.4],
  [990, 250, 0.9], [1120, 300, 1.2], [1260, 220, 1.0], [1400, 290, 1.5], [60, 320, 1.0], [470, 340, 0.8], [880, 360, 1.1], [1490, 380, 0.9],
] as const;
// The Southern Cross and the Pointers, as they stand over the hills in the evening.
const CRUX = { at: [1180, 150], stars: [[0, -34, 2.6], [2, 32, 2.9], [-25, 6, 2.6], [22, -4, 2.2]], pointers: [[-104, 42, 2.6], [-76, 32, 2.2]] } as const;
const HILLS = {
  far: "M0 470 C 140 400 260 430 400 400 S 640 340 800 380 S 1060 300 1200 350 S 1460 330 1600 300 V600 H0 Z",
  mid: "M0 520 C 180 470 300 500 460 470 S 720 420 900 450 S 1180 400 1330 430 S 1520 400 1600 380 V600 H0 Z",
  near: "M0 570 C 200 540 340 560 520 530 S 820 500 1000 520 S 1300 480 1460 500 S 1560 480 1600 470 V600 H0 Z",
};

/** A hero background: `time` sets the sky; children sit on top. `mill` places the windmill on the near ridge. */
export function Sky({ time = "dusk", mill = true, className, children }: { time?: SkyTime; mill?: boolean; className?: string; children?: React.ReactNode }) {
  const night = time !== "gold";
  return (
    <div className={cn("relative isolate overflow-hidden", { gold: "hh-sky-gold", dusk: "hh-sky-dusk", night: "hh-sky-night" }[time], className)}>
      <svg aria-hidden viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" className="pointer-events-none absolute inset-0 -z-10 h-full w-full">
        {night && (
          <g fill="#fbf7f3" opacity={time === "night" ? 0.9 : 0.55}>
            {STARS.map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} />
            ))}
            <g transform={`translate(${CRUX.at[0]} ${CRUX.at[1]})`}>
              {[...CRUX.stars, ...CRUX.pointers].map(([x, y, r], i) => (
                <circle key={i} cx={x} cy={y} r={r} />
              ))}
            </g>
          </g>
        )}
        <path d={HILLS.far} fill="#211c19" opacity={0.9} />
        <path d={HILLS.mid} fill="#141110" />
        <path d={HILLS.near} fill="#0c0a09" />
      </svg>
      {mill && <Mark aria-hidden title="" className="pointer-events-none absolute bottom-[8%] right-[9%] -z-10 hidden h-14 w-14 text-brand-500/80 sm:block lg:h-20 lg:w-20" spin />}
      {children}
      <span aria-hidden className="hh-beads absolute inset-x-0 bottom-0" />
    </div>
  );
}
