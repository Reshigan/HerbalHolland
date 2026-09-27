// Static reference data for the demo network. Addresses and companies are fictional.

export const HQ_COMPANY = {
  name: "Herbal Holland",
  legalName: "Herbal Holland (Pty) Ltd",
  regNumber: "2024/481516/07",
  vatNumber: "4870123456",
  contactName: "Naledi Khumalo",
  email: "hello@herbalholland.co.za",
  phone: "012 004 4200",
  address: "Herbal Holland House, 1 Windmill Lane, Irene, Centurion, 0157",
};

export const REGIONS = [
  { code: "GPN", name: "Tshwane & North" },
  { code: "GPS", name: "Johannesburg & South" },
  { code: "WC", name: "Western Cape" },
  { code: "KZN", name: "KwaZulu-Natal" },
  { code: "INT", name: "Interior & Eastern Cape" },
] as const;

type Prov = "GP" | "WC" | "KZN" | "EC" | "FS" | "LP" | "MP" | "NW" | "NC";

export const DCS: { code: string; slug: string; name: string; region: string; addressLine: string; suburb: string; city: string; province: Prov; postalCode: string; lat: number; lng: number }[] = [
  { code: "DC-GP", slug: "dc-midrand", name: "Midrand Distribution Centre", region: "GPS", addressLine: "Unit 4, Allandale Business Park", suburb: "Midrand", city: "Midrand", province: "GP", postalCode: "1685", lat: -25.99, lng: 28.13 },
  { code: "DC-WC", slug: "dc-montague", name: "Cape Town Distribution Centre", region: "WC", addressLine: "22 Montague Drive", suburb: "Montague Gardens", city: "Cape Town", province: "WC", postalCode: "7441", lat: -33.86, lng: 18.52 },
  { code: "DC-KZN", slug: "dc-pinetown", name: "Durban Distribution Centre", region: "KZN", addressLine: "9 Josiah Gumede Road", suburb: "Pinetown", city: "Durban", province: "KZN", postalCode: "3610", lat: -29.81, lng: 30.86 },
];

export const OWNERS = [
  { key: "mokoena", legalName: "Mokoena Retail (Pty) Ltd", contact: "Thabo Mokoena", email: "thabo@mokoenaretail.co.za", vat: "4410023456" },
  { key: "vdm", legalName: "VDM Ventures (Pty) Ltd", contact: "Annelie van der Merwe", email: "annelie@vdmventures.co.za", vat: "4420034567" },
  { key: "letsatsi", legalName: "Letsatsi Holdings (Pty) Ltd", contact: "Kagiso Letsatsi", email: "kagiso@letsatsi.co.za", vat: "4430045678" },
  { key: "oxford", legalName: "Oxford Leaf Trading (Pty) Ltd", contact: "Priya Pillay", email: "priya@oxfordleaf.co.za", vat: "4440056789" },
  { key: "seventh", legalName: "Seventh Street Collective (Pty) Ltd", contact: "Ruan Pretorius", email: "ruan@seventhstreet.co.za", vat: "4450067890" },
  { key: "witkoppen", legalName: "Witkoppen Wellness (Pty) Ltd", contact: "Megan Smith", email: "megan@witkoppenwellness.co.za", vat: "4460078901" },
  { key: "kasi", legalName: "Kasi Green (Pty) Ltd", contact: "Sipho Dlamini", email: "sipho@kasigreen.co.za", vat: "4470089012" },
  { key: "atlantic", legalName: "Atlantic Leaf (Pty) Ltd", contact: "Liam Jacobs", email: "liam@atlanticleaf.co.za", vat: "4480090123" },
  { key: "woodstock", legalName: "Woodstock Botanicals (Pty) Ltd", contact: "Fatima Adams", email: "fatima@woodstockbotanicals.co.za", vat: "4490001234" },
  { key: "winelands", legalName: "Winelands Herbal (Pty) Ltd", contact: "Francois du Plessis", email: "francois@winelandsherbal.co.za", vat: "4500012345" },
  { key: "coastal", legalName: "Coastal Greens (Pty) Ltd", contact: "Ayanda Mkhize", email: "ayanda@coastalgreens.co.za", vat: "4510023456" },
  { key: "berea", legalName: "Berea Botanicals (Pty) Ltd", contact: "Rajesh Govender", email: "rajesh@bereabotanicals.co.za", vat: "4520034567" },
  { key: "bay", legalName: "Bay Botanicals (Pty) Ltd", contact: "Lindiwe Ngcobo", email: "lindiwe@baybotanicals.co.za", vat: "4530045678" },
  { key: "rosecity", legalName: "Rose City Retail (Pty) Ltd", contact: "Hendrik Venter", email: "hendrik@rosecityretail.co.za", vat: "4540056789" },
  // Below the R2.3m VAT threshold — demonstrates non-vendor stores.
  { key: "lowveld", legalName: "Lowveld Leaf (Pty) Ltd", contact: "Nomsa Mahlangu", email: "nomsa@lowveldleaf.co.za", vat: null },
] as const;

export type StoreSeed = {
  code: string; slug: string; name: string; owner: string; region: string; dc: string; format: "FLAGSHIP" | "STANDARD" | "EXPRESS";
  status?: "ACTIVE" | "OPENING_SOON"; addressLine: string; suburb: string; city: string; province: Prov; postalCode: string;
  lat: number; lng: number; sameDay?: boolean;
};

export const STORES: StoreSeed[] = [
  { code: "PTA01", slug: "hatfield", name: "Hatfield", owner: "mokoena", region: "GPN", dc: "DC-GP", format: "FLAGSHIP", addressLine: "1122 Burnett Street", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083", lat: -25.7487, lng: 28.238, sameDay: true },
  { code: "PTA02", slug: "menlyn", name: "Menlyn", owner: "vdm", region: "GPN", dc: "DC-GP", format: "FLAGSHIP", addressLine: "Shop 14, Aramist Avenue", suburb: "Waterkloof Glen", city: "Pretoria", province: "GP", postalCode: "0181", lat: -25.7847, lng: 28.2772, sameDay: true },
  { code: "PTA03", slug: "brooklyn", name: "Brooklyn", owner: "mokoena", region: "GPN", dc: "DC-GP", format: "STANDARD", addressLine: "338 Fehrsen Street", suburb: "Brooklyn", city: "Pretoria", province: "GP", postalCode: "0181", lat: -25.77, lng: 28.238 },
  { code: "PTA04", slug: "centurion", name: "Centurion", owner: "letsatsi", region: "GPN", dc: "DC-GP", format: "STANDARD", addressLine: "Shop 7, Heuwel Avenue", suburb: "Centurion Central", city: "Centurion", province: "GP", postalCode: "0157", lat: -25.857, lng: 28.189, sameDay: true },
  { code: "PTA05", slug: "montana", name: "Montana", owner: "letsatsi", region: "GPN", dc: "DC-GP", format: "EXPRESS", addressLine: "Sefako Makgatho Drive", suburb: "Montana", city: "Pretoria", province: "GP", postalCode: "0182", lat: -25.676, lng: 28.256 },
  { code: "JHB01", slug: "rosebank", name: "Rosebank", owner: "oxford", region: "GPS", dc: "DC-GP", format: "FLAGSHIP", addressLine: "31 Tyrwhitt Avenue", suburb: "Rosebank", city: "Johannesburg", province: "GP", postalCode: "2196", lat: -26.146, lng: 28.043, sameDay: true },
  { code: "JHB02", slug: "sandton", name: "Sandton", owner: "oxford", region: "GPS", dc: "DC-GP", format: "FLAGSHIP", addressLine: "88 Rivonia Road", suburb: "Sandown", city: "Johannesburg", province: "GP", postalCode: "2196", lat: -26.1076, lng: 28.0567, sameDay: true },
  { code: "JHB03", slug: "melville", name: "Melville", owner: "seventh", region: "GPS", dc: "DC-GP", format: "STANDARD", addressLine: "22 7th Street", suburb: "Melville", city: "Johannesburg", province: "GP", postalCode: "2092", lat: -26.176, lng: 28.009 },
  { code: "JHB04", slug: "fourways", name: "Fourways", owner: "witkoppen", region: "GPS", dc: "DC-GP", format: "STANDARD", addressLine: "Witkoppen Road", suburb: "Fourways", city: "Johannesburg", province: "GP", postalCode: "2191", lat: -26.018, lng: 28.007, sameDay: true },
  { code: "JHB05", slug: "maboneng", name: "Maboneng", owner: "kasi", region: "GPS", dc: "DC-GP", format: "STANDARD", addressLine: "264 Fox Street", suburb: "Maboneng", city: "Johannesburg", province: "GP", postalCode: "2094", lat: -26.204, lng: 28.059 },
  { code: "JHB06", slug: "soweto", name: "Soweto", owner: "kasi", region: "GPS", dc: "DC-GP", format: "STANDARD", addressLine: "8115 Vilakazi Street", suburb: "Orlando West", city: "Johannesburg", province: "GP", postalCode: "1804", lat: -26.238, lng: 27.908 },
  { code: "CPT01", slug: "sea-point", name: "Sea Point", owner: "atlantic", region: "WC", dc: "DC-WC", format: "FLAGSHIP", addressLine: "301 Main Road", suburb: "Sea Point", city: "Cape Town", province: "WC", postalCode: "8005", lat: -33.919, lng: 18.385, sameDay: true },
  { code: "CPT02", slug: "woodstock", name: "Woodstock", owner: "woodstock", region: "WC", dc: "DC-WC", format: "STANDARD", addressLine: "160 Albert Road", suburb: "Woodstock", city: "Cape Town", province: "WC", postalCode: "7925", lat: -33.927, lng: 18.446, sameDay: true },
  { code: "CPT03", slug: "claremont", name: "Claremont", owner: "atlantic", region: "WC", dc: "DC-WC", format: "STANDARD", addressLine: "54 Main Road", suburb: "Claremont", city: "Cape Town", province: "WC", postalCode: "7708", lat: -33.981, lng: 18.465 },
  { code: "CPT04", slug: "durbanville", name: "Durbanville", owner: "woodstock", region: "WC", dc: "DC-WC", format: "EXPRESS", addressLine: "Wellington Road", suburb: "Durbanville", city: "Cape Town", province: "WC", postalCode: "7550", lat: -33.833, lng: 18.649 },
  { code: "STB01", slug: "stellenbosch", name: "Stellenbosch", owner: "winelands", region: "WC", dc: "DC-WC", format: "STANDARD", addressLine: "12 Dorp Street", suburb: "Central", city: "Stellenbosch", province: "WC", postalCode: "7600", lat: -33.938, lng: 18.861 },
  { code: "DBN01", slug: "umhlanga", name: "Umhlanga", owner: "coastal", region: "KZN", dc: "DC-KZN", format: "FLAGSHIP", addressLine: "15 Lighthouse Road", suburb: "Umhlanga Rocks", city: "Durban", province: "KZN", postalCode: "4319", lat: -29.727, lng: 31.086, sameDay: true },
  { code: "DBN02", slug: "florida-road", name: "Florida Road", owner: "berea", region: "KZN", dc: "DC-KZN", format: "STANDARD", addressLine: "275 Florida Road", suburb: "Morningside", city: "Durban", province: "KZN", postalCode: "4001", lat: -29.834, lng: 31.02, sameDay: true },
  { code: "DBN03", slug: "ballito", name: "Ballito", owner: "coastal", region: "KZN", dc: "DC-KZN", format: "EXPRESS", addressLine: "Ballito Drive", suburb: "Ballito", city: "Ballito", province: "KZN", postalCode: "4420", lat: -29.539, lng: 31.214 },
  { code: "PMB01", slug: "pietermaritzburg", name: "Pietermaritzburg", owner: "berea", region: "KZN", dc: "DC-KZN", format: "STANDARD", addressLine: "402 Chief Albert Luthuli Street", suburb: "Central", city: "Pietermaritzburg", province: "KZN", postalCode: "3201", lat: -29.601, lng: 30.379 },
  { code: "PLZ01", slug: "gqeberha", name: "Gqeberha", owner: "bay", region: "INT", dc: "DC-WC", format: "STANDARD", addressLine: "Marine Drive", suburb: "Summerstrand", city: "Gqeberha", province: "EC", postalCode: "6001", lat: -33.98, lng: 25.657 },
  { code: "ELS01", slug: "east-london", name: "East London", owner: "bay", region: "INT", dc: "DC-KZN", format: "EXPRESS", addressLine: "Esplanade", suburb: "Quigney", city: "East London", province: "EC", postalCode: "5201", lat: -33.015, lng: 27.911 },
  { code: "BFN01", slug: "bloemfontein", name: "Bloemfontein", owner: "rosecity", region: "INT", dc: "DC-GP", format: "STANDARD", addressLine: "41 Second Avenue", suburb: "Westdene", city: "Bloemfontein", province: "FS", postalCode: "9301", lat: -29.11, lng: 26.204 },
  { code: "MBB01", slug: "mbombela", name: "Mbombela", owner: "lowveld", region: "INT", dc: "DC-GP", format: "EXPRESS", addressLine: "Samora Machel Drive", suburb: "Central", city: "Mbombela", province: "MP", postalCode: "1200", lat: -25.475, lng: 30.97 },
  { code: "PLK01", slug: "polokwane", name: "Polokwane", owner: "lowveld", region: "INT", dc: "DC-GP", format: "STANDARD", status: "OPENING_SOON", addressLine: "Thabo Mbeki Street", suburb: "Central", city: "Polokwane", province: "LP", postalCode: "0699", lat: -23.904, lng: 29.469 },
  { code: "GRJ01", slug: "george", name: "George", owner: "winelands", region: "WC", dc: "DC-WC", format: "STANDARD", status: "OPENING_SOON", addressLine: "York Street", suburb: "Central", city: "George", province: "WC", postalCode: "6529", lat: -33.963, lng: 22.461 },
];

export const CATEGORIES = [
  { slug: "flower", name: "Flower", icon: "Flower2", blurb: "Hand-trimmed, lab-tested, batch-traceable." },
  { slug: "pre-rolls", name: "Pre-rolls", icon: "Cigarette", blurb: "Rolled with whole flower. No shake, no trim." },
  { slug: "edibles", name: "Edibles", icon: "Cookie", blurb: "5 mg per piece. Child-resistant. Clearly labelled." },
  { slug: "vapes", name: "Vapes", icon: "Wind", blurb: "Live resin and terpene-true cartridges." },
  { slug: "concentrates", name: "Concentrates", icon: "Droplet", blurb: "Hash and rosin in the Dutch tradition." },
  { slug: "wellness", name: "CBD Wellness", icon: "Leaf", blurb: "Schedule 0 CBD rituals for everyday calm." },
  { slug: "accessories", name: "Accessories", icon: "Sparkles", blurb: "Grinders, glass and the tools of the ritual." },
  { slug: "grow", name: "Grow", icon: "Sprout", blurb: "Everything for the home grow — soil to light." },
  { slug: "apparel", name: "Apparel", icon: "Shirt", blurb: "Wear the windmill." },
] as const;

type Terp = [string, number];
export type ProductSeed = {
  slug: string;
  name: string;
  tagline: string;
  cat: (typeof CATEGORIES)[number]["slug"];
  line?: "HOUSE" | "HERITAGE" | "CLASSIC" | "RESERVE" | "PARTNER";
  reg: "THC" | "CBD" | "HEMP" | "ACCESSORY" | "APPAREL" | "GROW";
  strain?: "INDICA" | "SATIVA" | "HYBRID" | "CBD";
  thc?: [number, number];
  cbd?: [number, number];
  terps?: Terp[];
  effects?: string[];
  flavours?: string[];
  lineage?: string;
  origin?: string;
  heritage?: boolean;
  featured?: boolean;
  desc: string;
  cbdPack?: number;
  cbdDay?: number;
  claims?: string[];
  tobacco?: boolean;
  supplier: string;
  shelfMonths: number;
  variants: [name: string, grams: number | null, priceRand: number][];
};

const HH_CULT = "Herbal Holland Cultivation, Hartbeespoort";
const MPONDO = "Mpondo Growers Co-operative, Lusikisiki";
const KZN_HERITAGE = "KZN Heritage Growers Collective, Eshowe";
const KAROO = "Karoo Craft Farms, Prince Albert";

export const PRODUCTS: ProductSeed[] = [
  // ── Flower ─────────────────────────────────────────────────────────────
  { slug: "durban-poison", name: "Durban Poison", tagline: "The KwaZulu-Natal landrace that went global", cat: "flower", line: "HERITAGE", reg: "THC", strain: "SATIVA", thc: [17, 21], terps: [["Terpinolene", 0.9], ["Myrcene", 0.4], ["Ocimene", 0.3]], effects: ["uplifted", "focused", "creative"], flavours: ["Anise", "Sweet spice", "Pine"], origin: "Durban, KwaZulu-Natal", heritage: true, featured: true, supplier: KZN_HERITAGE, shelfMonths: 12, desc: "A pure sativa landrace from the hills behind Durban, carried to Amsterdam in the 1970s and back home to us. Sun-grown by the KZN Heritage Growers Collective from locally kept seed.", variants: [["1g", 1, 120], ["3.5g", 3.5, 390]] },
  { slug: "swazi-gold", name: "Swazi Gold", tagline: "Highland sunshine, bottled", cat: "flower", line: "HERITAGE", reg: "THC", strain: "SATIVA", thc: [15, 19], terps: [["Myrcene", 0.6], ["Limonene", 0.5], ["Caryophyllene", 0.3]], effects: ["uplifted", "social", "energised"], flavours: ["Citrus", "Earth", "Sweet grass"], origin: "Eswatini highlands", heritage: true, supplier: KZN_HERITAGE, shelfMonths: 12, desc: "The golden, citrus-forward landrace of the Eswatini highlands. Bright, talkative and made for long afternoons.", variants: [["1g", 1, 110], ["3.5g", 3.5, 360]] },
  { slug: "malawi-gold", name: "Malawi Gold", tagline: "The slow-flowering legend of Salima", cat: "flower", line: "HERITAGE", reg: "THC", strain: "SATIVA", thc: [16, 20], terps: [["Terpinolene", 0.7], ["Pinene", 0.5], ["Myrcene", 0.3]], effects: ["euphoric", "creative", "focused"], flavours: ["Honey", "Spice", "Cedar"], origin: "Salima, Malawi", heritage: true, supplier: KAROO, shelfMonths: 12, desc: "A 120-day sativa with a cult following. Honeyed, heady and worth the wait.", variants: [["1g", 1, 125], ["3.5g", 3.5, 410]] },
  { slug: "mpondo-gold", name: "Mpondo Gold", tagline: "Grown on the Wild Coast, paid for fairly", cat: "flower", line: "HERITAGE", reg: "THC", strain: "SATIVA", thc: [14, 18], terps: [["Pinene", 0.6], ["Myrcene", 0.4], ["Humulene", 0.2]], effects: ["uplifted", "social", "clear"], flavours: ["Citrus peel", "Fresh herbs", "Sea air"], origin: "Mpondoland, Eastern Cape", heritage: true, featured: true, supplier: MPONDO, shelfMonths: 12, desc: "Our partnership with the Mpondo Growers Co-operative brings the Wild Coast's heritage cultivar into the formal market — traceable to the farm, with a fair price guaranteed to growers.", variants: [["1g", 1, 100], ["3.5g", 3.5, 330]] },
  { slug: "windmill-haze", name: "Windmill Haze", tagline: "Our signature: Amsterdam haze meets Durban sun", cat: "flower", line: "HOUSE", reg: "THC", strain: "HYBRID", thc: [22, 26], terps: [["Terpinolene", 1.1], ["Limonene", 0.6], ["Caryophyllene", 0.4]], effects: ["uplifted", "creative", "social"], flavours: ["Lemon zest", "Haze", "Sweet pine"], lineage: "Amnesia Haze × Durban Poison", featured: true, supplier: HH_CULT, shelfMonths: 12, desc: "The house cultivar that defines us: a Dutch coffee-shop haze crossed with South Africa's most famous landrace. Grown indoors in Hartbeespoort, hang-dried for 14 days.", variants: [["1g", 1, 200], ["3.5g", 3.5, 650], ["7g", 7, 1200]] },
  { slug: "oranje-kush", name: "Oranje Kush", tagline: "Blood orange and hash — the evening one", cat: "flower", line: "HOUSE", reg: "THC", strain: "INDICA", thc: [21, 25], terps: [["Myrcene", 0.9], ["Limonene", 0.5], ["Linalool", 0.3]], effects: ["relaxed", "sleepy", "happy"], flavours: ["Blood orange", "Hash", "Earth"], lineage: "Orange Bud × Hindu Kush", featured: true, supplier: HH_CULT, shelfMonths: 12, desc: "Heavy, citrus-sweet and unhurried. The one for the end of the day.", variants: [["1g", 1, 190], ["3.5g", 3.5, 620]] },
  { slug: "delft-blue", name: "Delft Blue", tagline: "Blueberry and vanilla, painted slow", cat: "flower", line: "HOUSE", reg: "THC", strain: "HYBRID", thc: [20, 24], terps: [["Myrcene", 0.7], ["Caryophyllene", 0.5], ["Pinene", 0.3]], effects: ["relaxed", "calm", "happy"], flavours: ["Blueberry", "Vanilla", "Spice"], lineage: "Blueberry × Northern Lights", supplier: HH_CULT, shelfMonths: 12, desc: "Named for Delft's blue-and-white pottery: calm, detailed and quietly beautiful.", variants: [["1g", 1, 190], ["3.5g", 3.5, 620]] },
  { slug: "tulip-og", name: "Tulip OG", tagline: "Floral, fuel and perfectly balanced", cat: "flower", line: "HOUSE", reg: "THC", strain: "HYBRID", thc: [19, 23], terps: [["Limonene", 0.6], ["Caryophyllene", 0.5], ["Linalool", 0.3]], effects: ["balanced", "social", "creative"], flavours: ["Floral", "Lemon", "Fuel"], lineage: "OG Kush × Durban Poison", supplier: HH_CULT, shelfMonths: 12, desc: "An even-keeled hybrid for any hour. Opens floral, finishes gassy.", variants: [["1g", 1, 180], ["3.5g", 3.5, 590]] },
  { slug: "amnesia-haze", name: "Amnesia Haze", tagline: "The coffee-shop classic", cat: "flower", line: "CLASSIC", reg: "THC", strain: "SATIVA", thc: [20, 23], terps: [["Limonene", 0.7], ["Terpinolene", 0.6], ["Myrcene", 0.4]], effects: ["energised", "creative", "uplifted"], flavours: ["Citrus", "Earth", "Incense"], supplier: KAROO, shelfMonths: 12, desc: "A multiple Cannabis Cup winner and the benchmark of Dutch coffee-shop menus.", variants: [["1g", 1, 170], ["3.5g", 3.5, 560]] },
  { slug: "northern-lights", name: "Northern Lights", tagline: "Pure, calm, classic indica", cat: "flower", line: "CLASSIC", reg: "THC", strain: "INDICA", thc: [18, 21], terps: [["Myrcene", 0.8], ["Caryophyllene", 0.4], ["Pinene", 0.3]], effects: ["relaxed", "sleepy"], flavours: ["Pine", "Sweet earth"], supplier: KAROO, shelfMonths: 12, desc: "The indica that built the Dutch seed trade. Resinous, piney and deeply calming.", variants: [["1g", 1, 160], ["3.5g", 3.5, 520]] },
  { slug: "white-widow", name: "White Widow", tagline: "Frosted, balanced, timeless", cat: "flower", line: "CLASSIC", reg: "THC", strain: "HYBRID", thc: [18, 22], terps: [["Myrcene", 0.6], ["Caryophyllene", 0.4], ["Pinene", 0.3]], effects: ["balanced", "social", "focused"], flavours: ["Earth", "Wood", "Pepper"], supplier: KAROO, shelfMonths: 12, desc: "A 1990s Amsterdam icon, dusted white with trichomes.", variants: [["1g", 1, 160], ["3.5g", 3.5, 520]] },
  { slug: "reserve-gelato-cake", name: "Reserve No. 1 — Gelato Cake", tagline: "Small-batch. Numbered jars. Gone when it's gone.", cat: "flower", line: "RESERVE", reg: "THC", strain: "HYBRID", thc: [25, 28], terps: [["Caryophyllene", 0.9], ["Limonene", 0.6], ["Linalool", 0.4]], effects: ["relaxed", "euphoric", "happy"], flavours: ["Sweet cream", "Berries", "Gas"], lineage: "Gelato 33 × Wedding Cake", featured: true, supplier: HH_CULT, shelfMonths: 9, desc: "Our first Reserve release: 400 numbered jars, first access for Oranje-tier members.", variants: [["3.5g", 3.5, 880]] },
  // ── Pre-rolls ──────────────────────────────────────────────────────────
  { slug: "windmill-haze-pre-roll", name: "Windmill Haze Pre-roll", tagline: "Our signature, ready when you are", cat: "pre-rolls", line: "HOUSE", reg: "THC", strain: "HYBRID", thc: [22, 26], effects: ["uplifted", "creative"], flavours: ["Lemon zest", "Haze"], supplier: HH_CULT, shelfMonths: 6, desc: "One gram of whole Windmill Haze flower in an unbleached cone with a glass tip.", variants: [["1 × 1g", 1, 190]] },
  { slug: "heritage-pre-roll-trio", name: "Heritage Pre-roll Trio", tagline: "Durban Poison, Swazi Gold, Malawi Gold", cat: "pre-rolls", line: "HERITAGE", reg: "THC", strain: "SATIVA", thc: [15, 21], effects: ["uplifted", "social"], flavours: ["Anise", "Citrus", "Honey"], heritage: true, featured: true, supplier: KZN_HERITAGE, shelfMonths: 6, desc: "A tasting flight of Southern Africa's great landraces — three half-gram pre-rolls.", variants: [["3 × 0.5g", 1.5, 240]] },
  { slug: "oranje-kush-minis", name: "Oranje Kush Minis", tagline: "Five small ones for slow evenings", cat: "pre-rolls", line: "HOUSE", reg: "THC", strain: "INDICA", thc: [21, 25], effects: ["relaxed", "sleepy"], flavours: ["Blood orange", "Hash"], supplier: HH_CULT, shelfMonths: 6, desc: "Five 0.35g minis in a crush-proof tin.", variants: [["5 × 0.35g", 1.75, 260]] },
  // ── Edibles ────────────────────────────────────────────────────────────
  { slug: "stroopwafel-bites", name: "Stroopwafel Bites", tagline: "Caramel waffles, the Dutch way — 5 mg each", cat: "edibles", line: "HOUSE", reg: "THC", strain: "HYBRID", effects: ["relaxed", "happy"], flavours: ["Caramel", "Cinnamon"], supplier: "Herbal Holland Kitchen, Irene", shelfMonths: 6, desc: "Ten bite-size stroopwafels, 5 mg THC each, in a child-resistant tin. Start with one and wait two hours.", variants: [["10 × 5mg", 0.5, 240]] },
  { slug: "rooibos-honey-gummies", name: "Rooibos & Honey Gummies", tagline: "Proudly South African, precisely dosed", cat: "edibles", line: "HOUSE", reg: "THC", strain: "INDICA", effects: ["relaxed", "calm"], flavours: ["Rooibos", "Fynbos honey"], featured: true, supplier: "Herbal Holland Kitchen, Irene", shelfMonths: 6, desc: "Twenty 5 mg gummies made with Cederberg rooibos and fynbos honey. Child-resistant, with every piece individually marked.", variants: [["20 × 5mg", 0.5, 280]] },
  { slug: "dark-chocolate-squares", name: "70% Dark Chocolate Squares", tagline: "Single-origin cocoa, 5 mg a square", cat: "edibles", line: "PARTNER", reg: "THC", strain: "HYBRID", effects: ["relaxed", "happy"], flavours: ["Dark chocolate", "Sea salt"], supplier: "Cape Cacao Co., Woodstock", shelfMonths: 9, desc: "Ten scored squares of 70% dark chocolate. 5 mg THC per square.", variants: [["10 × 5mg", 0.25, 260]] },
  // ── Vapes ──────────────────────────────────────────────────────────────
  { slug: "windmill-haze-cartridge", name: "Windmill Haze Live Resin Cartridge", tagline: "Terpene-true, 510-thread", cat: "vapes", line: "HOUSE", reg: "THC", strain: "HYBRID", thc: [70, 78], effects: ["uplifted", "creative"], flavours: ["Lemon zest", "Pine"], tobacco: true, supplier: HH_CULT, shelfMonths: 12, desc: "Live resin from fresh-frozen Windmill Haze. Ceramic coil, no additives.", variants: [["1ml", 1, 650]] },
  { slug: "durban-poison-disposable", name: "Durban Poison Disposable", tagline: "The landrace, anywhere", cat: "vapes", line: "HERITAGE", reg: "THC", strain: "SATIVA", thc: [68, 75], effects: ["uplifted", "focused"], flavours: ["Anise", "Sweet spice"], heritage: true, tobacco: true, supplier: KZN_HERITAGE, shelfMonths: 12, desc: "Rechargeable all-in-one with Durban Poison distillate and botanical terpenes.", variants: [["0.5ml", 0.5, 450]] },
  // ── Concentrates ───────────────────────────────────────────────────────
  { slug: "nederhash", name: "Nederhash", tagline: "Hand-pressed hash in the Amsterdam tradition", cat: "concentrates", line: "HOUSE", reg: "THC", strain: "INDICA", thc: [35, 45], effects: ["relaxed", "happy"], flavours: ["Spice", "Leather", "Incense"], supplier: HH_CULT, shelfMonths: 12, desc: "Traditional hand-pressed hashish made from ice-water sifted trichomes.", variants: [["1g", 1, 350]] },
  { slug: "durban-poison-live-rosin", name: "Durban Poison Live Rosin", tagline: "Solventless. Pressed from fresh flower.", cat: "concentrates", line: "HERITAGE", reg: "THC", strain: "SATIVA", thc: [65, 72], effects: ["uplifted", "focused"], flavours: ["Anise", "Pine"], heritage: true, supplier: KZN_HERITAGE, shelfMonths: 9, desc: "Heat-and-pressure extracted, no solvents — tested for residual solvents anyway.", variants: [["1g", 1, 850]] },
  // ── CBD Wellness (Schedule 0) ─────────────────────────────────────────
  { slug: "calm-cbd-oil-600", name: "Calm CBD Oil 600mg", tagline: "20 mg a day, every day", cat: "wellness", line: "HOUSE", reg: "CBD", strain: "CBD", cbd: [2, 2], effects: ["calm", "focus"], flavours: ["Peppermint"], cbdPack: 600, cbdDay: 20, claims: ["Supports everyday calm", "Helps you unwind"], featured: true, supplier: "Herbal Holland Wellness Lab, Irene", shelfMonths: 18, desc: "Broad-spectrum CBD in MCT oil with natural peppermint. 30 ml, 20 mg per 1 ml serving. THC-free (< 0.001%).", variants: [["30ml", null, 595]] },
  { slug: "rest-cbd-oil-300", name: "Rest CBD Oil 300mg", tagline: "Chamomile and CBD for the wind-down", cat: "wellness", line: "HOUSE", reg: "CBD", strain: "CBD", cbd: [1, 1], effects: ["rest", "calm"], flavours: ["Chamomile", "Honeybush"], cbdPack: 300, cbdDay: 10, claims: ["Supports a restful wind-down"], supplier: "Herbal Holland Wellness Lab, Irene", shelfMonths: 18, desc: "A gentler 10 mg daily serving with chamomile and honeybush.", variants: [["30ml", null, 395]] },
  { slug: "cbd-softgels", name: "CBD Softgels 10mg", tagline: "Measured, portable, tasteless", cat: "wellness", line: "HOUSE", reg: "CBD", strain: "CBD", effects: ["calm", "focus"], cbdPack: 300, cbdDay: 20, claims: ["Supports general wellbeing"], supplier: "Herbal Holland Wellness Lab, Irene", shelfMonths: 24, desc: "Thirty 10 mg softgels. Take one or two a day with food.", variants: [["30 capsules", null, 450]] },
  { slug: "recover-cbd-balm", name: "Recover CBD Muscle Balm", tagline: "Arnica, wintergreen and 500 mg CBD", cat: "wellness", line: "HOUSE", reg: "CBD", strain: "CBD", effects: ["recover"], flavours: ["Wintergreen"], cbdPack: 500, cbdDay: 20, claims: ["Soothes tired muscles after exercise"], supplier: "Herbal Holland Wellness Lab, Irene", shelfMonths: 24, desc: "A warming balm for after the run, the ride or the gym.", variants: [["50ml", null, 385]] },
  { slug: "rooibos-cbd-tea", name: "Rooibos & CBD Tea", tagline: "A calming evening ritual", cat: "wellness", line: "HOUSE", reg: "CBD", strain: "CBD", effects: ["calm", "rest"], flavours: ["Rooibos", "Vanilla"], cbdPack: 100, cbdDay: 15, claims: ["A calming evening ritual"], supplier: "Cederberg Tea Estates, Clanwilliam", shelfMonths: 18, desc: "Twenty bags of organic Cederberg rooibos with 5 mg CBD each.", variants: [["20 bags", null, 180]] },
  { slug: "swazi-gold-cbd-vape", name: "Swazi Gold Terpene CBD Vape", tagline: "The landrace's aroma — THC-free", cat: "wellness", line: "HERITAGE", reg: "CBD", strain: "CBD", effects: ["focus", "calm"], flavours: ["Citrus", "Sweet grass"], cbdPack: 300, cbdDay: 20, claims: ["Supports focus through the day"], tobacco: true, heritage: true, supplier: "Herbal Holland Wellness Lab, Irene", shelfMonths: 18, desc: "300 mg CBD with a terpene profile modelled on Swazi Gold. THC-free.", variants: [["1ml", null, 420]] },
  // ── Hemp ───────────────────────────────────────────────────────────────
  { slug: "hemp-seed-face-oil", name: "Hemp Seed Face Oil", tagline: "Cold-pressed, fragrance-free", cat: "wellness", line: "HOUSE", reg: "HEMP", effects: ["recover"], claims: ["Nourishes and softens skin"], supplier: "Karoo Hemp Mill, Graaff-Reinet", shelfMonths: 18, desc: "Cold-pressed South African hemp seed oil for dry and sensitive skin.", variants: [["30ml", null, 290]] },
  { slug: "hemp-hand-cream", name: "Hemp Hand Cream", tagline: "For hard-working hands", cat: "wellness", line: "HOUSE", reg: "HEMP", claims: ["Hydrates dry hands"], supplier: "Karoo Hemp Mill, Graaff-Reinet", shelfMonths: 18, desc: "Rich, fast-absorbing hand cream with hemp seed oil and shea butter.", variants: [["75ml", null, 165]] },
  // ── Accessories ────────────────────────────────────────────────────────
  { slug: "oranje-grinder", name: "Oranje 4-Piece Grinder", tagline: "Anodised aluminium, diamond teeth", cat: "accessories", line: "HOUSE", reg: "ACCESSORY", featured: true, supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "Four-piece aluminium grinder in Oranje anodising with a pollen screen and scraper.", variants: [["63mm", null, 350]] },
  { slug: "king-size-papers", name: "Unbleached King Size Slim Papers", tagline: "Natural gum, 32 leaves", cat: "accessories", line: "PARTNER", reg: "ACCESSORY", tobacco: true, supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "Ultra-thin unbleached papers with natural acacia gum.", variants: [["Booklet", null, 35]] },
  { slug: "delft-water-pipe", name: "Delft Glass Water Pipe", tagline: "Hand-painted blue on borosilicate", cat: "accessories", line: "HOUSE", reg: "ACCESSORY", tobacco: true, supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "A 30 cm borosilicate water pipe hand-painted in Delft blue.", variants: [["30cm", null, 1250]] },
  { slug: "kite-vaporiser", name: "Kite Dry-Herb Vaporiser", tagline: "Convection heat, precise to the degree", cat: "accessories", line: "PARTNER", reg: "ACCESSORY", tobacco: true, supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "Pocket convection vaporiser with 5 heat settings and USB-C charging.", variants: [["Device", null, 2450]] },
  { slug: "uv-stash-jar", name: "UV Glass Stash Jar", tagline: "Violet glass keeps it fresh", cat: "accessories", line: "HOUSE", reg: "ACCESSORY", supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "Airtight violet glass that blocks visible light.", variants: [["100ml", null, 220], ["250ml", null, 320]] },
  { slug: "windmill-rolling-tray", name: "Windmill Rolling Tray", tagline: "Matte black, orange windmill", cat: "accessories", line: "HOUSE", reg: "ACCESSORY", supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "Medium metal rolling tray with rolled edges.", variants: [["Medium", null, 280]] },
  { slug: "smell-proof-pouch", name: "Smell-proof Pouch", tagline: "Activated carbon lining", cat: "accessories", line: "HOUSE", reg: "ACCESSORY", supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "Zippered pouch with an activated-carbon lining and combination lock.", variants: [["One size", null, 190]] },
  { slug: "hemp-wick", name: "Hemp Wick", tagline: "Beeswax-coated, 3 m", cat: "accessories", line: "PARTNER", reg: "ACCESSORY", supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "Organic hemp twine coated in South African beeswax.", variants: [["3m", null, 45]] },
  // ── Grow ───────────────────────────────────────────────────────────────
  { slug: "living-soil", name: "Living Soil Mix", tagline: "Amended, alive, ready to plant", cat: "grow", line: "PARTNER", reg: "GROW", supplier: "Highveld Soil Co.", shelfMonths: 0, desc: "Pre-amended living soil with worm castings, biochar and mycorrhizae.", variants: [["50L", null, 420]] },
  { slug: "bloom-nutrient-kit", name: "Organic Bloom Nutrient Kit", tagline: "Three bottles, whole cycle", cat: "grow", line: "PARTNER", reg: "GROW", supplier: "Highveld Soil Co.", shelfMonths: 0, desc: "Grow, bloom and finish nutrients with a feeding chart.", variants: [["3 × 500ml", null, 650]] },
  { slug: "grow-tent", name: "Grow Tent 80 × 80", tagline: "Mylar-lined, light-tight", cat: "grow", line: "PARTNER", reg: "GROW", supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "80 × 80 × 160 cm tent with reflective mylar lining.", variants: [["80×80×160", null, 1950]] },
  { slug: "led-grow-light", name: "Full-Spectrum LED 200W", tagline: "Dimmable, efficient, quiet", cat: "grow", line: "PARTNER", reg: "GROW", supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "Samsung-diode full-spectrum board, dimmable, passively cooled.", variants: [["200W", null, 3200]] },
  { slug: "heritage-seed-pack", name: "Durban Poison Heritage Seeds", tagline: "Five regular seeds, locally kept", cat: "grow", line: "HERITAGE", reg: "GROW", heritage: true, supplier: KZN_HERITAGE, shelfMonths: 24, desc: "Regular seeds from the KZN Heritage Growers Collective's preserved line.", variants: [["5 seeds", null, 250]] },
  // ── Apparel ────────────────────────────────────────────────────────────
  { slug: "windmill-tee", name: "Windmill Tee", tagline: "Heavyweight cotton, made in Cape Town", cat: "apparel", line: "HOUSE", reg: "APPAREL", featured: true, supplier: "Salt River Apparel, Cape Town", shelfMonths: 0, desc: "220 gsm cotton tee, black with the orange windmill on the chest.", variants: [["S", null, 450], ["M", null, 450], ["L", null, 450], ["XL", null, 450]] },
  { slug: "oranje-hoodie", name: "Oranje Hoodie", tagline: "Brushed fleece, bold back print", cat: "apparel", line: "HOUSE", reg: "APPAREL", supplier: "Salt River Apparel, Cape Town", shelfMonths: 0, desc: "Oversized orange hoodie with the full Herbal Holland lock-up on the back.", variants: [["S", null, 850], ["M", null, 850], ["L", null, 850], ["XL", null, 850]] },
  { slug: "oranje-bucket-hat", name: "Oranje Bucket Hat", tagline: "For long days in the sun", cat: "apparel", line: "HOUSE", reg: "APPAREL", supplier: "Salt River Apparel, Cape Town", shelfMonths: 0, desc: "Cotton twill bucket hat with embroidered windmill.", variants: [["One size", null, 380]] },
  { slug: "windmill-enamel-pin", name: "Windmill Enamel Pin", tagline: "The mark, in hard enamel", cat: "apparel", line: "HOUSE", reg: "APPAREL", supplier: "Herbal Holland Goods", shelfMonths: 0, desc: "25 mm hard-enamel pin with rubber clutch.", variants: [["25mm", null, 95]] },
];

export const FIRST_NAMES = [
  "Thabo", "Sipho", "Lerato", "Naledi", "Ayanda", "Zanele", "Pieter", "Johan", "Annelie", "Liezl", "Priya", "Kavitha", "Rajesh",
  "Ashwin", "Fatima", "Yusuf", "Aisha", "Liam", "Emma", "Chloe", "Sean", "Kyle", "Tumi", "Kagiso", "Neo", "Lwazi", "Nomsa", "Mpho",
  "Karabo", "Bongani", "Themba", "Refilwe", "Palesa", "Hendrik", "Francois", "Marike", "Ruan", "Jaco", "Wian", "Sarah", "Megan",
  "Ryan", "Jason", "Nadia", "Zaid", "Shaun", "Candice", "Lindiwe", "Sibusiso", "Dineo", "Tshepo", "Mandla", "Busisiwe", "Thandeka",
  "Anika", "Chantelle", "Keegan", "Tristan", "Zinhle", "Boitumelo", "Mohammed", "Shireen", "Deon", "Carla", "Musa", "Lebo",
];
export const LAST_NAMES = [
  "Nkosi", "Dlamini", "Mokoena", "Khumalo", "Ndlovu", "Botha", "van der Merwe", "Pretorius", "Naidoo", "Pillay", "Govender", "Moodley",
  "Petersen", "Adams", "Jacobs", "Williams", "Smith", "Mthembu", "Zulu", "Mahlangu", "Molefe", "Sithole", "Ngcobo", "Kruger", "du Plessis",
  "Steyn", "Venter", "Coetzee", "Fourie", "Hendricks", "Isaacs", "Abrahams", "Cele", "Mkhize", "Radebe", "Maseko", "Baloyi", "Chetty",
  "Reddy", "Singh", "Swart", "Nel", "Olivier", "Daniels", "Mabaso", "Shabalala", "Motaung", "Tshabalala",
];
