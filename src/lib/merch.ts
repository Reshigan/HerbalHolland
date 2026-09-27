// The made-to-order merch collection: which garment, colour and embroidery/print each product carries. Our merch
// partner (Lucani, Cape Town) makes each piece when it's ordered and couriers it, white-label, to the customer —
// no stock, no minimums. Upmarket by design: the logos are embroidered; the big back graphics and the tote are
// printed (DTF: printed film, heat-pressed). Pieces the partner can't make yet are held back (`pending`).
// Artwork lives in src/components/merch/art.tsx; the partner's files are rendered by scripts/merch-export.tsx.

export type ArtKey = "mark-stitch" | "lockup-stitch" | "heritage-stitch" | "window-back" | "sunset-back" | "tote-front";
export type Garment = "tee" | "hoodie" | "crew" | "cap" | "bucket" | "beanie" | "tote";
export type Side = "front" | "back";
export type Print = { art: ArtKey; side: Side; technique: "Embroidery" | "DTF"; where: string };

export type MerchItem = {
  slug: string; // Product.slug
  name: string;
  blank: string; // the garment the partner makes it on
  garment: Garment;
  colour: "black" | "sunset"; // garment colour; the thread/print is always the other brand colour
  hero: Side; // the view the shop shows
  prints: Print[];
  pending?: string; // designed, but not on sale until the partner can make it
};

const CHEST = { art: "mark-stitch", side: "front", technique: "Embroidery", where: "Left chest, 80 mm below the shoulder seam" } as const;

export const MERCH: MerchItem[] = [
  {
    slug: "windmill-tee", name: "Windmill Tee", blank: "Black combed-cotton tee (Lucani Urban Luxe; heavier blank on request)", garment: "tee", colour: "black", hero: "back",
    prints: [CHEST, { art: "window-back", side: "back", technique: "DTF", where: "Centre back, 75 mm below the collar" }],
  },
  {
    slug: "sunset-hoodie", name: "Sunset Hoodie", blank: "Orange fleece hoodie (Lucani CityCore 240 g), closest to Sunset 500", garment: "hoodie", colour: "sunset", hero: "back",
    prints: [
      { art: "lockup-stitch", side: "front", technique: "Embroidery", where: "Left chest, 90 mm below the shoulder seam" },
      { art: "sunset-back", side: "back", technique: "DTF", where: "Centre back, 70 mm below the hood seam" },
    ],
  },
  {
    slug: "heritage-crewneck", name: "Heritage Crewneck", blank: "Black fleece crewneck (confirm the blank with the partner)", garment: "crew", colour: "black", hero: "front",
    prints: [{ art: "heritage-stitch", side: "front", technique: "Embroidery", where: "Centre chest, 90 mm below the collar" }],
  },
  {
    slug: "windmill-cap", name: "Windmill Cap", blank: "Black unstructured washed-cotton cap (Lucani Retro Curve)", garment: "cap", colour: "black", hero: "front",
    prints: [{ art: "mark-stitch", side: "front", technique: "Embroidery", where: "Front panels, centred over the seam" }],
  },
  {
    slug: "sunset-bucket-hat", name: "Sunset Bucket Hat", blank: "Black cotton-twill bucket hat", garment: "bucket", colour: "black", hero: "front",
    prints: [{ art: "mark-stitch", side: "front", technique: "Embroidery", where: "Front, centred, 20 mm above the brim seam" }],
    pending: "Our partner doesn't make bucket hats yet — on sale once a white-label source is confirmed",
  },
  {
    slug: "windmill-beanie", name: "Windmill Beanie", blank: "Black rib-knit cuffed beanie", garment: "beanie", colour: "black", hero: "front",
    prints: [{ art: "mark-stitch", side: "front", technique: "Embroidery", where: "Cuff, centred" }],
    pending: "Our partner doesn't make beanies yet — on sale once a white-label source is confirmed",
  },
  {
    slug: "windmill-tote", name: "Windmill Tote", blank: "Black heavy cotton-canvas tote (confirm the blank with the partner)", garment: "tote", colour: "black", hero: "front",
    prints: [{ art: "tote-front", side: "front", technique: "DTF", where: "Centre front, 70 mm below the top edge" }],
  },
];

export const merchFor = (slug: string) => MERCH.find((m) => m.slug === slug);

/** How long the partner takes to make and deliver an order (shown to shoppers). */
export const MADE_TO_ORDER_LEAD = "5–8 working days";
