// The beadwork frame around the menu board: rows of beads in the brand colours, laid in diagonal bands the way
// Zulu beadwork runs. Pure SVG patterns (no images), scaled from the viewport so the beads stay round on any TV.
// Server component.

const ROWS = 3;
const COLS = 8;
const STEP = 8; // bead pitch in pattern units
const R = 3.1; // bead radius
// Diagonal bands: orange, cream, leaf, dark, amber — repeated along the diagonal.
const BAND = ["var(--color-brand-500)", "var(--color-brand-500)", "var(--color-ink-50)", "var(--color-leaf-500)", "var(--color-ink-700)", "var(--color-ink-700)", "var(--color-amber-500)", "var(--color-ink-50)"];

function Beads({ id }: { id: string }) {
  const beads: React.ReactNode[] = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) beads.push(<circle key={`${row}-${col}`} cx={col * STEP + STEP / 2} cy={row * STEP + STEP / 2} r={R} fill={BAND[(col + row) % BAND.length]} />);
  return (
    <pattern id={id} width={COLS * STEP} height={ROWS * STEP} patternUnits="userSpaceOnUse">
      {beads}
    </pattern>
  );
}

/**
 * Four strips around the screen. Each strip's SVG scales its short side to the strip (viewBox height = 3 bead rows)
 * and crops the long side, so the beads are the same size everywhere.
 */
export function BeadFrame() {
  const h = ROWS * STEP; // 24 units = the strip's thickness
  const long = 6000;
  const strip = "pointer-events-none absolute";
  return (
    <div aria-hidden className="bead-frame contents">
      <svg className={`${strip} left-0 top-0 h-[var(--bead)] w-full`} viewBox={`0 0 ${long} ${h}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <Beads id="bead-h" />
        </defs>
        <rect width={long} height={h} fill="url(#bead-h)" />
      </svg>
      <svg className={`${strip} bottom-0 left-0 h-[var(--bead)] w-full`} viewBox={`0 0 ${long} ${h}`} preserveAspectRatio="xMidYMid slice">
        <rect width={long} height={h} fill="url(#bead-h)" />
      </svg>
      <svg className={`${strip} left-0 top-0 h-full w-[var(--bead)]`} viewBox={`0 0 ${h} ${long}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="bead-v" width={h} height={COLS * STEP} patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
            {Array.from({ length: ROWS * COLS }, (_, i) => {
              const row = Math.floor(i / COLS);
              const col = i % COLS;
              return <circle key={i} cx={col * STEP + STEP / 2} cy={row * STEP + STEP / 2} r={R} fill={BAND[(col + row) % BAND.length]} />;
            })}
          </pattern>
        </defs>
        <rect width={h} height={long} fill="url(#bead-v)" />
      </svg>
      <svg className={`${strip} right-0 top-0 h-full w-[var(--bead)]`} viewBox={`0 0 ${h} ${long}`} preserveAspectRatio="xMidYMid slice">
        <rect width={h} height={long} fill="url(#bead-v)" />
      </svg>
    </div>
  );
}

/** A short bead divider under a panel title. */
export function BeadRule({ className }: { className?: string }) {
  const n = 14;
  return (
    <svg aria-hidden className={className} viewBox={`0 0 ${n * STEP} ${STEP}`} preserveAspectRatio="xMinYMid meet">
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={i * STEP + STEP / 2} cy={STEP / 2} r={R} fill={BAND[i % BAND.length]} />
      ))}
    </svg>
  );
}
