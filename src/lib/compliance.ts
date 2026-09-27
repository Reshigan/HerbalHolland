// Compliance engine. Rules are data (HQ settings) so the network can adapt as South
// African regulation evolves — e.g. switching on licensed sales per store when a
// Cannabis Bill commences, or the Tobacco Bill's online-sales ban — without code changes.
export type RegClass = "THC" | "CBD" | "HEMP" | "ACCESSORY" | "APPAREL" | "GROW";
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
  tobaccoBillMode: boolean; // B33-2022 in force: related products in-store only, no loyalty
};

export const DEFAULT_COMPLIANCE: ComplianceSettings = {
  minAge: 18,
  ageRestricted: ["THC", "CBD", "HEMP", "ACCESSORY", "GROW"],
  licensedOnly: ["THC"],
  thcMode: "MEDICAL",
  dailyLimitGrams: 30,
  channels: {
    POS: ["THC", "CBD", "HEMP", "ACCESSORY", "APPAREL", "GROW"],
    COLLECT: ["THC", "CBD", "HEMP", "ACCESSORY", "APPAREL", "GROW"],
    SAME_DAY: ["CBD", "HEMP", "ACCESSORY", "APPAREL", "GROW"],
    COURIER: ["CBD", "HEMP", "ACCESSORY", "APPAREL", "GROW"],
  },
  tobaccoBillMode: false,
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
    if (c?.age != null && c.age < s.minAge) blocks.push(`Customer is under ${s.minAge}`);
    else if (!c?.ageVerified && !input.ageCheckedAtCounter) blocks.push(`Age verification required (${s.minAge}+)`);
  }

  const licensed = input.items.filter((i) => s.licensedOnly.includes(i.regClass));
  const gramsInCart = licensed.reduce((g, i) => g + (i.grams ?? 0) * i.qty, 0);
  const needsPrescription = licensed.length > 0 && s.thcMode === "MEDICAL";

  if (needsPrescription) {
    const p = c?.patient;
    if (!p?.active) blocks.push("A valid SAHPRA patient authorisation must be on file for this customer");
    else if (gramsInCart > p.remainingGrams)
      blocks.push(`Exceeds the authorised quantity: ${fmtG(p.remainingGrams)} left this month, ${fmtG(gramsInCart)} in cart`);
    if (input.channel === "POS" && input.staffCanDispense === false) blocks.push("An authorised dispenser must complete this sale");
  } else if (gramsInCart > 0 && gramsInCart + (input.gramsToday ?? 0) > s.dailyLimitGrams)
    blocks.push(`Daily limit is ${s.dailyLimitGrams}g per customer (${fmtG(input.gramsToday ?? 0)} already today + ${fmtG(gramsInCart)} in cart)`);

  return { ok: blocks.length === 0, blocks, needsAgeCheck, needsPrescription, gramsInCart };
}

/**
 * Classes excluded from incentives (promotions, member/volume prices, markdowns, Guilders earn).
 * In MEDICAL mode licensed products are medicines: Medicines Act s18A prohibits supplying
 * medicine under a bonus, rebate or other incentive scheme.
 */
export const incentiveExcluded = (s: ComplianceSettings): RegClass[] => (s.thcMode === "MEDICAL" ? s.licensedOnly : []);

/** Loyalty earn is switched off for Tobacco-Bill related products when that regime is active. */
export const earnsLoyalty = (item: { tobaccoRelated?: boolean }, s: ComplianceSettings) => !(s.tobaccoBillMode && item.tobaccoRelated);

// ── Schedule 0 CBD master-data validation (GN 586 of 2020) ───────────────────
export function validateCbdProduct(p: { regClass: RegClass; cbdMgPerPack?: number | null; cbdMgPerDay?: number | null; thcMax?: number | null; claims?: string[] }) {
  const issues: string[] = [];
  if (p.regClass !== "CBD") return issues;
  if (p.cbdMgPerPack == null) issues.push("CBD per pack (mg) is required");
  else if (p.cbdMgPerPack > 600) issues.push("Schedule 0 allows at most 600 mg CBD per sales pack");
  if (p.cbdMgPerDay == null) issues.push("Maximum daily dose (mg) is required");
  else if (p.cbdMgPerDay > 20) issues.push("Schedule 0 allows a maximum daily dose of 20 mg CBD");
  if (p.thcMax != null && p.thcMax > 0.001) issues.push("Consumable products may contain at most 0.001% THC");
  for (const c of p.claims ?? []) for (const f of screenCopy(c)) issues.push(`Claim "${c}": ${f.reason}`);
  return issues;
}

// ── Marketing copy screening (ARB Code, Medicines Act s20, CfPPA "advertise for sale") ─
const RULES: { re: RegExp; reason: string }[] = [
  { re: /\b(cure[sd]?|treat(s|ment)?|heal(s|ing)?|prevent(s|ion)?|remed(y|ies))\b/i, reason: "Medicinal claim — Schedule 0 CBD may only make low-risk wellness claims" },
  { re: /\b(anxiety|depression|cancer|epilepsy|seizures?|insomnia|arthritis|ptsd|diabetes|chronic pain)\b/i, reason: "Names a medical condition" },
  { re: /\b(get(ting)? high|stoned|baked|wasted|zooted|faded|blazed)\b/i, reason: "Glamorises intoxication — keep copy responsible (ARB Code 3.3)" },
  { re: /\b(kids?|children|teens?|school|students?|under ?18)\b/i, reason: "May appeal to or reference minors" },
  { re: /\b(100% safe|no side[- ]effects|guaranteed|miracle|clinically proven)\b/i, reason: "Absolute or unsubstantiated claim (ARB Code 4.1–4.2)" },
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
  CBD: "CBD wellness (Schedule 0)",
  HEMP: "Hemp",
  ACCESSORY: "Accessory",
  APPAREL: "Apparel",
  GROW: "Grow",
};
