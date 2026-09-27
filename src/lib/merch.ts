// The made-to-order merch collection: which garment, colour and print each product carries.
// Artwork lives in src/components/merch/art.tsx; print files are rendered by scripts/merch-export.tsx.

export type ArtKey = "chest-mark" | "window-back" | "sunset-back" | "heritage-front" | "tote-front" | "lockup-chest" | "stitch-mark";
export type Garment = "tee" | "hoodie" | "crew" | "cap" | "bucket" | "tote";
export type Side = "front" | "back";
export type Print = { art: ArtKey; side: Side; technique: "DTG" | "Embroidery" };

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
  { slug: "windmill-tee", name: "Windmill Tee", blank: "Black heavyweight cotton tee (190–220 gsm)", garment: "tee", colour: "black", hero: "back", prints: [{ art: "chest-mark", side: "front", technique: "DTG" }, { art: "window-back", side: "back", technique: "DTG" }] },
  { slug: "sunset-hoodie", name: "Sunset Hoodie", blank: "Orange brushed-fleece hoodie, closest to Sunset 500", garment: "hoodie", colour: "sunset", hero: "back", prints: [{ art: "lockup-chest", side: "front", technique: "DTG" }, { art: "sunset-back", side: "back", technique: "DTG" }] },
  { slug: "heritage-crewneck", name: "Heritage Crewneck", blank: "Black brushed-fleece crewneck sweatshirt", garment: "crew", colour: "black", hero: "front", prints: [{ art: "heritage-front", side: "front", technique: "DTG" }] },
  { slug: "windmill-cap", name: "Windmill Cap", blank: "Black six-panel cotton-twill cap, adjustable strap", garment: "cap", colour: "black", hero: "front", prints: [{ art: "stitch-mark", side: "front", technique: "Embroidery" }] },
  { slug: "sunset-bucket-hat", name: "Sunset Bucket Hat", blank: "Black cotton-twill bucket hat", garment: "bucket", colour: "black", hero: "front", prints: [{ art: "stitch-mark", side: "front", technique: "Embroidery" }] },
  { slug: "windmill-tote", name: "Windmill Tote", blank: "Black heavy cotton-canvas tote", garment: "tote", colour: "black", hero: "front", prints: [{ art: "tote-front", side: "front", technique: "DTG" }] },
];

export const merchFor = (slug: string) => MERCH.find((m) => m.slug === slug);
