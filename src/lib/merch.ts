// The made-to-order merch collection: which garment, colour and print each product carries. Our print partner (OTC
// Printing, Oudtshoorn) prints each piece when it's ordered and couriers it, white-label, to the customer — no stock,
// no minimums. Artwork lives in src/components/merch/art.tsx; print files are rendered by scripts/merch-export.tsx.

export type ArtKey = "chest-mark" | "window-back" | "sunset-back" | "heritage-front" | "tote-front" | "lockup-chest" | "cap-mark";
export type Garment = "tee" | "hoodie" | "crew" | "cap" | "tote";
export type Side = "front" | "back";
// DTG: printed straight onto the garment; transfer: printed film heat-pressed on (caps).
export type Print = { art: ArtKey; side: Side; technique: "DTG" | "Transfer" };

export type MerchItem = {
  slug: string; // Product.slug
  name: string;
  blank: string; // the garment the partner prints on
  garment: Garment;
  colour: "black" | "sunset"; // garment colour; the print is always the other brand ink
  hero: Side; // the view the shop shows
  prints: Print[];
};

export const MERCH: MerchItem[] = [
  { slug: "windmill-tee", name: "Windmill Tee", blank: "Black heavyweight cotton tee (SA-made Vic Bay Heavy Weight)", garment: "tee", colour: "black", hero: "back", prints: [{ art: "chest-mark", side: "front", technique: "DTG" }, { art: "window-back", side: "back", technique: "DTG" }] },
  { slug: "sunset-hoodie", name: "Sunset Hoodie", blank: "Orange fleece hoodie, closest to Sunset 500 on the partner's swatch", garment: "hoodie", colour: "sunset", hero: "back", prints: [{ art: "lockup-chest", side: "front", technique: "DTG" }, { art: "sunset-back", side: "back", technique: "DTG" }] },
  { slug: "heritage-crewneck", name: "Heritage Crewneck", blank: "Black fleece crewneck sweatshirt", garment: "crew", colour: "black", hero: "front", prints: [{ art: "heritage-front", side: "front", technique: "DTG" }] },
  { slug: "windmill-cap", name: "Windmill Cap", blank: "Black six-panel cap, adjustable strap", garment: "cap", colour: "black", hero: "front", prints: [{ art: "cap-mark", side: "front", technique: "Transfer" }] },
  { slug: "windmill-tote", name: "Windmill Tote", blank: "Black cotton tote bag", garment: "tote", colour: "black", hero: "front", prints: [{ art: "tote-front", side: "front", technique: "DTG" }] },
];

export const merchFor = (slug: string) => MERCH.find((m) => m.slug === slug);

/** How long the print partner takes to make and deliver an order (shown to shoppers). */
export const MADE_TO_ORDER_LEAD = "5–7 working days";
