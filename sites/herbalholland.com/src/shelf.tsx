// The categories "on the shelf" (home): one illustrated product per category, standing on an oak shelf. Plain shapes
// in the storefront's paints (pa-* classes in site.css): no brands, no product names, no leaves, nothing to consume.
// Each draws in a 160 × 160 box with the shelf line at y = 150.
import { Sails } from "./art";

/** The mark's four petals, small, as a print on a pack or a shirt. */
const Print = ({ x, y, s = 0.36 }: { x: number; y: number; s?: number }) => (
  <g className="pa-print" transform={`translate(${x} ${y}) scale(${s})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <Sails />
  </g>
);

const ART: Record<string, React.ReactNode> = {
  // CBD wellness: an amber dropper bottle in front of its box.
  cbd: (
    <>
      <rect className="pa-char" x="84" y="70" width="50" height="80" rx="3" />
      <rect className="pa-org" x="84" y="94" width="50" height="9" />
      <path className="pa-amber" d="M40 90h46v56a4 4 0 0 1-4 4H44a4 4 0 0 1-4-4z" />
      <rect className="pa-amber2" x="54" y="78" width="18" height="14" rx="2" />
      <rect className="pa-cap" x="50" y="60" width="26" height="20" rx="4" />
      <path className="pa-bulb" d="M55 61c0-20 16-20 16 0z" />
      <rect className="pa-cream" x="44" y="106" width="38" height="32" rx="2" />
      <Print x={63} y={121} />
    </>
  ),
  // CBD coffee and food: a coffee pouch, a mug and a few beans.
  food: (
    <>
      <path className="pa-kraft" d="M26 150V66l8-12h54l8 12v84z" />
      <path className="pa-kraft2" d="M26 66h70v9H26z" />
      <rect className="pa-char" x="38" y="92" width="46" height="34" rx="4" />
      <Print x={61} y={109} />
      <path className="pa-cup" d="M134 122h5a9 9 0 0 1 0 18h-5" />
      <rect className="pa-cream" x="100" y="112" width="36" height="38" rx="6" />
      <rect className="pa-org" x="100" y="124" width="36" height="6" />
      <ellipse className="pa-bean" cx="146" cy="147" rx="6" ry="3.5" />
      <ellipse className="pa-bean" cx="94" cy="147" rx="5" ry="3" />
    </>
  ),
  // CBD skin care: a jar with an oak lid, and a tube standing on its cap.
  skin: (
    <>
      <rect className="pa-cream" x="26" y="104" width="64" height="46" rx="10" />
      <rect className="pa-org" x="26" y="122" width="64" height="7" />
      <rect className="pa-oak" x="23" y="90" width="70" height="17" rx="6" />
      <path className="pa-terra" d="M104 134l5-76h18l5 76z" />
      <rect className="pa-cream" x="108" y="54" width="20" height="7" rx="1" />
      <rect className="pa-char" x="103" y="134" width="30" height="16" rx="3" />
      <Print x={118} y={96} s={0.3} />
    </>
  ),
  // Collagen and protein supplements: a tall tub and a sachet.
  supplements: (
    <>
      <rect className="pa-cream" x="36" y="60" width="66" height="90" rx="8" />
      <rect className="pa-cap" x="32" y="50" width="74" height="15" rx="5" />
      <rect className="pa-org" x="36" y="90" width="66" height="26" />
      <Print x={69} y={103} s={0.34} />
      <rect className="pa-kraft" x="112" y="104" width="28" height="46" rx="3" />
      <rect className="pa-org" x="112" y="116" width="28" height="6" />
    </>
  ),
  // Accessories: a glass storage jar with an oak lid, and a tin.
  accessories: (
    <>
      <rect className="pa-glass" x="30" y="74" width="56" height="76" rx="10" />
      <path className="pa-shine" d="M40 88v44" />
      <rect className="pa-oak" x="27" y="60" width="62" height="17" rx="5" />
      <rect className="pa-char" x="96" y="110" width="44" height="40" rx="6" />
      <rect className="pa-org" x="96" y="110" width="44" height="11" rx="4" />
    </>
  ),
  // Apparel: a tee on a hanger, with the windmill on the chest.
  apparel: (
    <>
      <path className="pa-hook" d="M80 44v-6a7 7 0 1 1 7 7" />
      <path className="pa-hanger" d="M80 44L42 62h76z" />
      <path className="pa-cream" d="M58 58l-26 14 10 22 12-6v62h52V88l12 6 10-22-26-14c-4 9-11 13-22 13s-18-4-22-13z" />
      <Print x={80} y={106} s={0.42} />
    </>
  ),
  // Grow: a watering can and a terracotta pot.
  grow: (
    <>
      <path className="pa-spout" d="M86 116l36-34" />
      <rect className="pa-cap" x="116" y="72" width="16" height="10" rx="3" transform="rotate(-42 124 77)" />
      <path className="pa-handle" d="M34 96a24 24 0 0 1 48 0" />
      <rect className="pa-cream" x="28" y="94" width="60" height="56" rx="7" />
      <rect className="pa-org" x="28" y="112" width="60" height="7" />
      <path className="pa-terra" d="M100 124h44l-7 26h-30z" />
      <rect className="pa-terra3" x="97" y="116" width="50" height="11" rx="3" />
      <ellipse className="pa-soil" cx="122" cy="118" rx="20" ry="3" />
    </>
  ),
  // The online shop: a kraft bag with the windmill.
  shop: (
    <>
      <path className="pa-handle" d="M62 70v-8a18 18 0 0 1 36 0v8" />
      <path className="pa-kraft" d="M40 70h80l6 80H34z" />
      <path className="pa-kraft2" d="M40 70h80l1 12H39z" />
      <Print x={80} y={114} s={0.62} />
    </>
  ),
};

export function ShelfArt({ kind, className }: { kind: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <ellipse className="pa-shadow" cx="80" cy="150" rx="62" ry="5" />
      {ART[kind]}
    </svg>
  );
}
