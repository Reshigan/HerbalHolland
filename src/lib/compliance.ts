// Compliance engine. Rules are data (HQ settings) so the network can adapt as South
// African regulation evolves — e.g. switching on licensed sales per store when a
// Cannabis Bill commences, or the Tobacco Bill's online-sales ban — without code changes.
export type RegClass = "THC" | "CBD" | "CBD_FOOD" | "CBD_TOPICAL" | "HEMP" | "SUPPLEMENT" | "ACCESSORY" | "APPAREL" | "GROW";
export type SellChannel = "POS" | "COLLECT" | "SAME_DAY" | "COURIER";

export type ThcMode = "MEDICAL" | "ADULT_USE";

export type ComplianceSettings = {
  minAge: number;
  ageRestricted: RegClass[];
  licensedOnly: RegClass[]; // sellable only where the store holds a licence for the class
  // MEDICAL: SAHPRA pathway — valid patient authorisation, within its monthly quantity, dispensed by an authorised dispenser.
  // ADULT_USE: verified adults within a daily limit (for when an adult-use regime applies).
  thcMode: ThcMode;
  dailyLimitGrams: number; // ADULT_USE: per customer per day, licensed classes
  channels: Record<SellChannel, RegClass[]>;
  tobaccoBillMode: boolean; // B33-2022 in force: related products in-store only (no click & collect or delivery)
  membersOnly: boolean; // every sale needs a registered member (online and at the till)
  // Classes that never get promotions, points or commission — Medicines Act s18A covers every medicine, including
  // Schedule 0 complementary medicines (CBD supplements) until counsel says otherwise. Licensed classes are always out.
  noIncentives: RegClass[];
};

export const DEFAULT_COMPLIANCE: ComplianceSettings = {
  minAge: 18,
  ageRestricted: ["THC", "CBD", "CBD_FOOD", "CBD_TOPICAL", "HEMP", "ACCESSORY", "GROW"],
  licensedOnly: ["THC"],
  thcMode: "MEDICAL",
  dailyLimitGrams: 30,
  channels: {
    POS: ["THC", "CBD", "CBD_FOOD", "CBD_TOPICAL", "HEMP", "SUPPLEMENT", "ACCESSORY", "APPAREL", "GROW"],
    COLLECT: ["THC", "CBD", "CBD_FOOD", "CBD_TOPICAL", "HEMP", "SUPPLEMENT", "ACCESSORY", "APPAREL", "GROW"],
    SAME_DAY: ["CBD", "CBD_FOOD", "CBD_TOPICAL", "HEMP", "SUPPLEMENT", "ACCESSORY", "APPAREL", "GROW"],
    COURIER: ["CBD", "CBD_FOOD", "CBD_TOPICAL", "HEMP", "SUPPLEMENT", "ACCESSORY", "APPAREL", "GROW"],
  },
  tobaccoBillMode: false,
  membersOnly: true,
  noIncentives: ["CBD"],
};

export type ComplianceItem = { name: string; regClass: RegClass; grams?: number | null; qty: number; tobaccoRelated?: boolean };
export type PatientStatus = { active: boolean; remainingGrams: number; authNumber?: string };
export type ComplianceCustomer = { ageVerified: boolean; age?: number | null; patient?: PatientStatus | null } | null;

export type ComplianceResult = {
  ok: boolean;
  blocks: string[];
  needsAgeCheck: boolean;
  needsPrescription: boolean;
  gramsInCart: number;
};

export function checkCompliance(input: {
  items: ComplianceItem[];
  channel: SellChannel;
  customer: ComplianceCustomer;
  storeLicences?: RegClass[];
  gramsToday?: number;
  ageCheckedAtCounter?: boolean;
  staffCanDispense?: boolean; // POS only; online orders are dispensed at handover
  settings?: ComplianceSettings;
}): ComplianceResult {
  const s = input.settings ?? DEFAULT_COMPLIANCE;
  const blocks: string[] = [];
  if (s.membersOnly && !input.customer) blocks.push("Members only: add the member to the sale, or sign them up, first");
  const allowed = new Set(s.channels[input.channel]);
  const licences = new Set(input.storeLicences ?? []);

  for (const it of input.items) {
    if (s.licensedOnly.includes(it.regClass) && !licences.has(it.regClass))
      blocks.push(`${it.name} needs a licence this store doesn't hold`);
    else if (!allowed.has(it.regClass)) blocks.push(`${it.name} can't be sold via ${channelLabel(input.channel)}`);
    else if (s.tobaccoBillMode && it.tobaccoRelated && input.channel !== "POS")
      blocks.push(`${it.name} is in-store only (Tobacco Products Act)`);
  }

  const needsAgeCheck = input.items.some((i) => s.ageRestricted.includes(i.regClass));
  const c = input.customer;
  if (needsAgeCheck) {
    if (c?.age != null && c.age < s.minAge) blocks.push(`Under ${s.minAge}: age-restricted products can't be sold`);
    else if (!c?.ageVerified && !input.ageCheckedAtCounter) blocks.push(`Age verification required (${s.minAge}+)`);
  }

  const licensed = input.items.filter((i) => s.licensedOnly.includes(i.regClass));
  const gramsInCart = licensed.reduce((g, i) => g + (i.grams ?? 0) * i.qty, 0);
  const needsPrescription = licensed.length > 0 && s.thcMode === "MEDICAL";

  if (needsPrescription) {
    const p = c?.patient;
    if (!p?.active) blocks.push("A valid SAHPRA patient authorisation must be on file for this member");
    else if (gramsInCart > p.remainingGrams)
      blocks.push(`Exceeds the authorised quantity: ${fmtG(p.remainingGrams)} left this month, ${fmtG(gramsInCart)} in cart`);
    if (input.channel === "POS" && input.staffCanDispense === false) blocks.push("An authorised dispenser must complete this sale");
  } else if (gramsInCart > 0 && gramsInCart + (input.gramsToday ?? 0) > s.dailyLimitGrams)
    blocks.push(`Daily limit is ${s.dailyLimitGrams}g per member (${fmtG(input.gramsToday ?? 0)} already today + ${fmtG(gramsInCart)} in cart)`);

  return { ok: blocks.length === 0, blocks, needsAgeCheck, needsPrescription, gramsInCart };
}

// ── Trade (wholesale) baskets ────────────────────────────────────────────────

export type TradeComplianceItem = { name: string; regClass: RegClass; productStatus?: string };
export type TradeAllowedInput = { accountClasses: readonly string[]; sellerLicences: readonly string[]; productClass: RegClass; productStatus: string; licensedOnly?: readonly string[] };

/**
 * May this product be sold to this trade account by this seller? The account's allow-list, the seller's licence where
 * the class needs one (`licensedOnly`, THC by default), and the product must be live. THC is never traded, whatever
 * either side holds.
 */
export function tradeAllowed(a: TradeAllowedInput) {
  if (a.productClass === "THC") return false;
  if (a.productStatus !== "ACTIVE") return false;
  if (!a.accountClasses.includes(a.productClass)) return false;
  if ((a.licensedOnly ?? ["THC"]).includes(a.productClass) && !a.sellerLicences.includes(a.productClass)) return false;
  return true;
}

/** Why `tradeAllowed` said no, in plain English — null when it's allowed. */
export function tradeProblem(a: TradeAllowedInput & { name: string }) {
  if (a.productClass === "THC") return `${a.name} is a licensed medicine and isn't available to trade customers`;
  if (a.productStatus !== "ACTIVE") return `${a.name} isn't available right now`;
  if (!a.accountClasses.includes(a.productClass)) return `${a.name} is ${REG_CLASS_LABEL[a.productClass]}, which this account isn't approved to buy`;
  if ((a.licensedOnly ?? ["THC"]).includes(a.productClass) && !a.sellerLicences.includes(a.productClass)) return `${a.name} needs a licence this store doesn't hold`;
  return null;
}

/**
 * The trade rule (Medicines Act s22A: Schedule 0 CBD and excluded products may be sold to any business; THC never):
 * each line's class must be in the account's allow-list and, where the class needs a licence, held by the seller;
 * the product must be live. No member, age-gate or members-only rules — the buyer is a business whose buyers are
 * attested adults — and no quantity limits.
 */
export function evaluateTradeBasket(input: { items: TradeComplianceItem[]; accountClasses: readonly string[]; sellerLicences: readonly string[]; settings?: ComplianceSettings }) {
  const s = input.settings ?? DEFAULT_COMPLIANCE;
  const blocks: string[] = [];
  for (const it of input.items) {
    const problem = tradeProblem({ name: it.name, accountClasses: input.accountClasses, sellerLicences: input.sellerLicences, productClass: it.regClass, productStatus: it.productStatus ?? "ACTIVE", licensedOnly: s.licensedOnly });
    if (problem) blocks.push(problem);
  }
  return { ok: blocks.length === 0, blocks };
}

/**
 * Classes excluded from incentives (promotions, member/volume prices, markdowns, points earn, commission).
 * Medicines Act s18A prohibits supplying medicine under a bonus, rebate or other incentive scheme: licensed products in
 * MEDICAL mode, and the classes HQ lists in `noIncentives` (CBD supplements — Schedule 0 complementary medicines — by
 * default, until counsel clears them).
 */
export const incentiveExcluded = (s: ComplianceSettings): RegClass[] => [...new Set([...(s.thcMode === "MEDICAL" ? s.licensedOnly : []), ...(s.noIncentives ?? [])])];

/** Not used yet: Tobacco Bill mode only makes related products in-store only (checkCompliance); points still apply. */
export const earnsLoyalty = (item: { tobaccoRelated?: boolean }, s: ComplianceSettings) => !(s.tobaccoBillMode && item.tobaccoRelated);

// ── Product facts: net content, ingredients and allergens ────────────────────
/** The major allergens foodstuff labels must declare (R146 of 2010), plus an explicit "none" that stands alone. */
export const ALLERGENS = {
  gluten: "Cereals containing gluten",
  crustaceans: "Crustaceans",
  molluscs: "Molluscs",
  eggs: "Eggs",
  fish: "Fish",
  milk: "Milk",
  peanuts: "Peanuts",
  soybeans: "Soybeans",
  tree_nuts: "Tree nuts",
  none: "No major allergens",
} as const;
export type AllergenKey = keyof typeof ALLERGENS;
export const ALLERGEN_KEYS = Object.keys(ALLERGENS) as AllergenKey[];

export type ProductFact = "netContent" | "ingredients" | "allergens";
/**
 * The facts each class carries — all required before it can be listed, and shown to members on the product page and at
 * the till. Food and supplements declare allergens; skin care lists its ingredients; CBD supplements keep the pack
 * size in their variants.
 */
export const PRODUCT_FACTS: Partial<Record<RegClass, readonly ProductFact[]>> = {
  CBD: ["ingredients", "allergens"],
  CBD_FOOD: ["netContent", "ingredients", "allergens"],
  CBD_TOPICAL: ["netContent", "ingredients"],
  SUPPLEMENT: ["netContent", "ingredients", "allergens"],
};
export const carriesFact = (c: RegClass, f: ProductFact) => !!PRODUCT_FACTS[c]?.includes(f);

/** Classes that hold CBD: they state CBD per pack and keep THC at or under 0.001%. */
export const CBD_CLASSES: RegClass[] = ["CBD", "CBD_FOOD", "CBD_TOPICAL"];
export const THC_CAP_PCT = 0.001;
/** GN 586 of 2020: CBD food & drink may hold at most 0.0075% CBD, i.e. 0.075 mg per gram (a millilitre counted as a gram). */
export const cbdFoodLimitMg = (netContent: number) => (netContent * 75) / 1000;

/** Product fields that are compliance master data. */
export const COMPLIANCE_FIELDS: readonly string[] = ["legalBasis", "cbdMgPerPack", "cbdMgPerDay", "claims", "tobaccoRelated", "netContent", "netUnit", "ingredients", "allergens", "naturalCbd"];
/** A product edit that changes its class, a compliance field or a CBD class's THC cap is a compliance change (audited as compliance.product). */
export const complianceChange = (changed: readonly string[], regClass: RegClass) =>
  changed.some((k) => k === "regClass" || COMPLIANCE_FIELDS.includes(k) || (k === "thcMax" && CBD_CLASSES.includes(regClass)));

const mg = (n: number) => String(Math.round(n * 100) / 100);
/** "250 g", "1 kg", "50 ml", "1.5 l" — null when no net content is recorded. */
export function netContentLabel(netContent?: number | null, netUnit?: string | null) {
  if (netContent == null || netContent <= 0 || (netUnit !== "g" && netUnit !== "ml")) return null;
  if (netContent >= 1000) return `${mg(netContent / 1000)} ${netUnit === "g" ? "kg" : "l"}`;
  return `${mg(netContent)} ${netUnit}`;
}

/** "Contains: milk, soybeans", "No major allergens declared", or null when nothing has been declared. */
export function allergenStatement(allergens?: readonly string[] | null) {
  if (!allergens?.length) return null;
  if (allergens.includes("none")) return "No major allergens declared";
  const named = ALLERGEN_KEYS.filter((k) => k !== "none" && allergens.includes(k)).map((k) => ALLERGENS[k].toLowerCase());
  return named.length ? `Contains: ${named.join(", ")}` : null;
}
export const declaresAllergens = (allergens?: readonly string[] | null) => !!allergens?.some((a) => a !== "none" && a in ALLERGENS);

export type ProductMaster = {
  regClass: RegClass;
  cbdMgPerPack?: number | null;
  cbdMgPerDay?: number | null;
  thcMax?: number | null;
  claims?: string[];
  netContent?: number | null;
  netUnit?: string | null;
  ingredients?: string | null;
  allergens?: readonly string[] | null;
  naturalCbd?: boolean | null;
};

const CANNABIS_WORDS = /\b(cbd|cannabidiol|cannabis|cannabinoids?|hemp|thc|dagga|marijuana)\b/i;

/**
 * Product master-data rules by regulatory class. Returns plain, fixable messages; empty means it may be listed.
 *   CBD — Schedule 0 complementary medicine (GN 586 of 2020): ≤ 600 mg a pack, ≤ 20 mg a day, ≤ 0.001% THC.
 *   CBD_FOOD — GN 586 of 2020: ≤ 0.0075% CBD, only what's naturally in the ingredients, ≤ 0.001% THC.
 *   CBD_TOPICAL — ≤ 0.001% THC, applied not taken (no daily dose).
 *   SUPPLEMENT — no cannabis or CBD at all.
 * Every class that carries product facts needs them (PRODUCT_FACTS), and every claim is screened. Other classes: no rules.
 */
export function validateProduct(p: ProductMaster): string[] {
  const issues: string[] = [];
  const c = p.regClass;
  if (!PRODUCT_FACTS[c]) return issues;
  const label = REG_CLASS_LABEL[c];
  const net = p.netContent != null && p.netContent > 0 ? p.netContent : null;
  const unit = p.netUnit === "g" || p.netUnit === "ml" ? p.netUnit : null;
  if ((p.cbdMgPerPack != null && p.cbdMgPerPack < 0) || (p.cbdMgPerDay != null && p.cbdMgPerDay < 0)) issues.push("CBD amounts can't be negative");

  if (c === "CBD") {
    if (p.cbdMgPerPack == null) issues.push("CBD per pack (mg) is required");
    else if (p.cbdMgPerPack > 600) issues.push("Schedule 0 allows at most 600 mg CBD per sales pack");
    if (p.cbdMgPerDay == null) issues.push("Maximum daily dose (mg) is required");
    else if (p.cbdMgPerDay > 20) issues.push("Schedule 0 allows a maximum daily dose of 20 mg CBD");
    if (p.thcMax != null && p.thcMax > THC_CAP_PCT) issues.push("Consumable products may contain at most 0.001% THC");
  }
  if (c === "CBD_FOOD") {
    if (p.cbdMgPerPack == null) issues.push("CBD per pack (mg) is required");
    else if (net != null && unit && p.cbdMgPerPack > cbdFoodLimitMg(net) + 1e-9)
      issues.push(`CBD food & drink may hold at most ${mg(cbdFoodLimitMg(net))} mg CBD in ${mg(net)} ${unit} (0.0075%)`);
    if (!p.naturalCbd) issues.push("CBD food & drink may only hold the CBD naturally in its ingredients: tick to confirm none is added");
  }
  if (c === "CBD_FOOD" || c === "CBD_TOPICAL") {
    if (p.thcMax == null) issues.push(`Maximum THC (%) is required: ${label} may contain at most 0.001%`);
    else if (p.thcMax > THC_CAP_PCT) issues.push(`${label} may contain at most 0.001% THC`);
  }
  if (c === "CBD_TOPICAL" && p.cbdMgPerDay != null) issues.push("Skin care is applied, not taken: remove the daily dose");
  if (c === "SUPPLEMENT") {
    if (p.cbdMgPerPack != null || p.cbdMgPerDay != null || p.naturalCbd)
      issues.push("Supplements contain no CBD: remove the CBD amounts, or choose CBD food & drink or CBD supplements");
    const word = p.ingredients?.match(CANNABIS_WORDS)?.[0];
    if (word) issues.push(`Supplements are cannabis-free, but the ingredients mention “${word}”: choose a CBD class instead`);
  }

  // Product facts.
  if (carriesFact(c, "netContent")) {
    if (net == null) issues.push(c === "CBD_FOOD" ? "Net content is required (g or ml): the CBD limit is worked out from it" : "Net content is required (g or ml)");
    else if (!unit) issues.push("Choose g or ml for the net content");
  }
  if (carriesFact(c, "ingredients") && !p.ingredients?.trim()) issues.push("List the ingredients: members see them on the product page and at the till");
  if (carriesFact(c, "allergens")) {
    const a = p.allergens ?? [];
    const unknown = a.filter((k) => !(k in ALLERGENS));
    if (unknown.length) issues.push(`Unknown allergen: ${unknown.join(", ")}`);
    if (!a.some((k) => k in ALLERGENS)) issues.push("Declare allergens: tick each major allergen it contains, or “No major allergens”");
    else if (a.includes("none") && declaresAllergens(a)) issues.push("“No major allergens” can't be ticked together with an allergen");
  }

  for (const claim of p.claims ?? []) for (const f of screenCopy(claim)) issues.push(`Claim "${claim}": ${f.reason}`);
  return issues;
}

// ── Marketing copy screening (ARB Code, Medicines Act s20, CfPPA "advertise for sale", R146 for foodstuffs) ─
const RULES: { re: RegExp; reason: string }[] = [
  { re: /\b(cure[sd]?|treat(s|ment)?|heal(s|ing)?|prevent(s|ion)?|remed(y|ies))\b/i, reason: "Medicinal claim. Schedule 0 CBD may only make low-risk wellness claims" },
  { re: /\b(anxiety|depression|cancer|epilepsy|seizures?|insomnia|arthritis|ptsd|diabetes|chronic pain)\b/i, reason: "Names a medical condition" },
  { re: /\b(get(ting)? high|stoned|baked|wasted|zooted|faded|blazed)\b/i, reason: "Glamorises intoxication. Keep copy responsible (ARB Code 3.3)" },
  { re: /\b(kids?|children|teens?|school|students?|under ?18)\b/i, reason: "May appeal to or reference minors" },
  { re: /\b(100% safe|no side[- ]effects|guaranteed|miracle|clinically proven)\b/i, reason: "Absolute or unsubstantiated claim (ARB Code 4.1–4.2)" },
  {
    re: /\b(boost(s|ed|er|ers|ing)?|detox(es|ed|ing|ify|ifies|ifying|ification)?|fat[- ]?burn(s|er|ers|ing)?|burn(s|ing)? (body |belly )?fat|anti[- ]?age?ing|immun(e|ity)|weight[- ]?loss|los(e|es|ing) weight|slimming|metaboli(sm|c))\b/i,
    reason: "Health claim. Foods and supplements can't promise to boost, detox, burn fat, slow ageing, help immunity or cause weight loss (R146)",
  },
];

export function screenCopy(text: string) {
  const found: { term: string; reason: string }[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) found.push({ term: m[0], reason: r.reason });
  }
  return found;
}

const fmtG = (g: number) => `${Math.round(g * 10) / 10}g`;
export const channelLabel = (c: SellChannel) =>
  ({ POS: "in-store sale", COLLECT: "click & collect", SAME_DAY: "same-day delivery", COURIER: "courier delivery" })[c];

export const REG_CLASS_LABEL: Record<RegClass, string> = {
  THC: "Licensed (THC)",
  CBD: "CBD supplements (Schedule 0)",
  CBD_FOOD: "CBD food & drink",
  CBD_TOPICAL: "CBD skin care",
  HEMP: "Hemp",
  SUPPLEMENT: "Supplements",
  ACCESSORY: "Accessory",
  APPAREL: "Apparel",
  GROW: "Grow",
};

/** Every class, in display order — the one list pickers, filters and settings forms use. */
export const REG_CLASSES = Object.keys(REG_CLASS_LABEL) as RegClass[];

/** The legal-basis line a new product starts with (HQ can edit it; it's shown on the product page and in audits). */
export const DEFAULT_LEGAL_BASIS: Partial<Record<RegClass, string>> = {
  THC: "SAHPRA licence — medical pathway (Section 21 authorisation required)",
  CBD: "Schedule 0 CBD — GN 586 of 22 May 2020",
  CBD_FOOD: "CBD food — GN 586 of 22 May 2020 (≤ 0.0075% CBD, naturally occurring)",
  CBD_TOPICAL: "Cosmetic — Foodstuffs, Cosmetics and Disinfectants Act 54 of 1972",
  HEMP: "Hemp — Schedule 6 exclusion, GN 586 of 22 May 2020 (≤ 0.2% THC, not for ingestion; hemp-seed food ≤ 0.001%)",
  SUPPLEMENT: "Foodstuff — Foodstuffs, Cosmetics and Disinfectants Act 54 of 1972 (labelling: R146)",
};

/** One line per class for pickers: what belongs in it and the rule that decides it. */
export const REG_CLASS_HINT: Record<RegClass, string> = {
  THC: "Licensed medicines: sold only where the store holds the licence; in medical mode to patients, by a dispenser",
  CBD: "Oils and softgels (complementary medicines): at most 20 mg a day and 600 mg a pack, approved claims only",
  CBD_FOOD: "Coffee, tea and protein: at most 0.0075% CBD, only what's naturally in the ingredients; THC at most 0.001%",
  CBD_TOPICAL: "Creams and balms: THC at most 0.001%, no daily dose, claims screened",
  HEMP: "Hemp seed and fibre products with no CBD claims: THC at most 0.2% if not for eating, 0.001% in hemp-seed food",
  SUPPLEMENT: "Collagen, plain protein and other supplements with no cannabis or CBD at all",
  ACCESSORY: "Grinders, glass, papers and other gear",
  APPAREL: "Clothing and merch",
  GROW: "Soil, nutrients, lights and seeds",
};
