// The merch collection: which garment, colour and embroidery/print each product carries. Every piece is held in stock
// and sold like the rest of the range: delivered to the member's door, or collected in store. Upmarket by design: the
// logos are embroidered; the big back graphics and the tote are printed (DTF: printed film, heat-pressed). Pieces not
// on sale yet are held back (`pending`). Artwork lives in src/components/merch/art.tsx; the embroidery and print files
// are rendered by scripts/merch-export.tsx. (A variant with a partner code, Variant.podSku, is made to order instead:
// src/server/merch.ts.)

export type ArtKey = "mark-stitch" | "mark-stitch-cuff" | "lockup-stitch" | "heritage-stitch" | "window-back" | "sunset-back" | "tote-front";
export type Garment = "tee" | "hoodie" | "crew" | "cap" | "bucket" | "beanie" | "tote";
export type Side = "front" | "back";
export type Print = { art: ArtKey; side: Side; technique: "Embroidery" | "DTF"; where: string };

export type MerchItem = {
  slug: string; // Product.slug
  name: string;
  blank: string; // the garment it's made on
  garment: Garment;
  colour: "black" | "sunset"; // garment colour; the thread/print is always the other brand colour
  hero: Side; // the view the shop shows
  prints: Print[];
  pending?: string; // designed, but not on sale yet
};

const CHEST = { art: "mark-stitch", side: "front", technique: "Embroidery", where: "Left chest, 80 mm below the shoulder seam" } as const;

export const MERCH: MerchItem[] = [
  {
    slug: "windmill-tee", name: "Windmill Tee", blank: "Black combed-cotton tee", garment: "tee", colour: "black", hero: "back",
    prints: [CHEST, { art: "window-back", side: "back", technique: "DTF", where: "Centre back, 75 mm below the collar" }],
  },
  {
    slug: "sunset-hoodie", name: "Sunset Hoodie", blank: "Orange 240 g fleece hoodie, closest to Sunset 500", garment: "hoodie", colour: "sunset", hero: "back",
    prints: [
      { art: "lockup-stitch", side: "front", technique: "Embroidery", where: "Left chest, 90 mm below the shoulder seam" },
      { art: "sunset-back", side: "back", technique: "DTF", where: "Centre back, 70 mm below the hood seam" },
    ],
  },
  {
    slug: "heritage-crewneck", name: "Heritage Crewneck", blank: "Black fleece crewneck", garment: "crew", colour: "black", hero: "front",
    prints: [{ art: "heritage-stitch", side: "front", technique: "Embroidery", where: "Centre chest, 90 mm below the collar" }],
  },
  {
    slug: "windmill-cap", name: "Windmill Cap", blank: "Black unstructured washed-cotton cap", garment: "cap", colour: "black", hero: "front",
    prints: [{ art: "mark-stitch", side: "front", technique: "Embroidery", where: "Front panels, centred over the seam" }],
  },
  {
    slug: "sunset-bucket-hat", name: "Sunset Bucket Hat", blank: "Black 100% cotton-twill bucket hat, unstructured", garment: "bucket", colour: "black", hero: "front",
    prints: [{ art: "mark-stitch", side: "front", technique: "Embroidery", where: "Front, centred, 20 mm above the brim seam" }],
  },
  {
    slug: "windmill-beanie", name: "Windmill Beanie", blank: "Black ribbed cuffed beanie", garment: "beanie", colour: "black", hero: "front",
    prints: [{ art: "mark-stitch-cuff", side: "front", technique: "Embroidery", where: "Folded cuff, centred (through the outer layer only)" }],
  },
  {
    slug: "windmill-tote", name: "Windmill Tote", blank: "Black heavy cotton-canvas tote", garment: "tote", colour: "black", hero: "front",
    prints: [{ art: "tote-front", side: "front", technique: "DTF", where: "Centre front, 70 mm below the top edge" }],
  },
];

export const merchFor = (slug: string) => MERCH.find((m) => m.slug === slug);

/** How long a made-to-order variant takes to make and deliver (shown to shoppers). */
export const MADE_TO_ORDER_LEAD = "5–8 working days";
