// Product master data by regulatory class: CBD supplements (Schedule 0), CBD food & drink (0.0075%, naturally
// occurring), CBD skin care, cannabis-free supplements — plus product facts (net content, ingredients, R146 allergens),
// the food & supplement claims screen, and the demo catalogue the seed writes.
import { describe, expect, it } from "vitest";
import {
  ALLERGENS, DEFAULT_COMPLIANCE, PRODUCT_FACTS, REG_CLASSES, CBD_CLASSES, THC_CAP_PCT, allergenStatement, cbdFoodLimitMg, declaresAllergens, incentiveExcluded, netContentLabel,
  screenCopy, validateProduct, type ProductMaster, type RegClass,
} from "@/lib/compliance";
import { isCategoryIcon } from "@/components/product/category-icons";
import { CATEGORIES, PRODUCTS } from "../prisma/seed-data";

const oil: ProductMaster = { regClass: "CBD", cbdMgPerPack: 600, cbdMgPerDay: 20, thcMax: 0.001, claims: ["Supports everyday calm"], ingredients: "MCT oil, broad-spectrum hemp extract", allergens: ["none"] };
const coffee: ProductMaster = { regClass: "CBD_FOOD", cbdMgPerPack: 15, thcMax: 0.001, netContent: 250, netUnit: "g", naturalCbd: true, ingredients: "Arabica coffee, hemp flower and leaf", allergens: ["none"] };
const cream: ProductMaster = { regClass: "CBD_TOPICAL", cbdMgPerPack: 300, thcMax: 0.001, netContent: 50, netUnit: "ml", ingredients: "Aqua, shea butter, hemp extract", claims: ["Nourishes and softens skin"] };
const collagen: ProductMaster = { regClass: "SUPPLEMENT", netContent: 300, netUnit: "g", ingredients: "Hydrolysed marine collagen peptides (from fish)", allergens: ["fish"] };
const has = (issues: string[], text: string | RegExp) => issues.some((i) => (typeof text === "string" ? i.includes(text) : text.test(i)));

describe("CBD supplements (Schedule 0)", () => {
  it("keeps the Schedule 0 limits: 600 mg a pack, 20 mg a day, THC at most 0.001%, approved claims only", () => {
    expect(validateProduct(oil)).toEqual([]);
    expect(validateProduct({ ...oil, cbdMgPerPack: 601 })).toEqual(["Schedule 0 allows at most 600 mg CBD per sales pack"]);
    expect(validateProduct({ ...oil, cbdMgPerDay: 25 })).toEqual(["Schedule 0 allows a maximum daily dose of 20 mg CBD"]);
    expect(validateProduct({ ...oil, thcMax: 0.3 })).toEqual(["Consumable products may contain at most 0.001% THC"]);
    expect(validateProduct({ ...oil, cbdMgPerPack: null, cbdMgPerDay: null })).toEqual(["CBD per pack (mg) is required", "Maximum daily dose (mg) is required"]);
    expect(has(validateProduct({ ...oil, claims: ["Relieves anxiety"] }), 'Claim "Relieves anxiety"')).toBe(true);
    expect(validateProduct({ ...oil, cbdMgPerPack: -5 })).toContain("CBD amounts can't be negative");
  });

  it("needs its ingredients and an allergen declaration", () => {
    expect(validateProduct({ ...oil, ingredients: " " })).toEqual(["List the ingredients: members see them on the product page and at the till"]);
    expect(validateProduct({ ...oil, allergens: [] })).toEqual(["Declare allergens: tick each major allergen it contains, or “No major allergens”"]);
    expect(validateProduct({ ...oil, netContent: null, netUnit: null })).toEqual([]); // pack size lives in the variant (30ml)
  });

  it("get no promotions, member prices, points or commission by default (s18A), unlike the new classes", () => {
    const excluded = incentiveExcluded(DEFAULT_COMPLIANCE);
    expect(DEFAULT_COMPLIANCE.noIncentives).toEqual(["CBD"]);
    expect(excluded).toContain("CBD");
    expect(excluded).toContain("THC");
    for (const c of ["CBD_FOOD", "CBD_TOPICAL", "SUPPLEMENT"] as RegClass[]) expect(excluded).not.toContain(c);
    // Counsel clears CBD: HQ unticks it and CBD supplements get incentives again (licensed medicines never do).
    expect(incentiveExcluded({ ...DEFAULT_COMPLIANCE, noIncentives: [] })).toEqual(["THC"]);
  });
});

describe("CBD food & drink (GN 586 of 2020)", () => {
  it("allows at most 0.0075% CBD of the net content, worked out in milligrams", () => {
    expect(validateProduct(coffee)).toEqual([]);
    expect(cbdFoodLimitMg(250)).toBe(18.75);
    expect(cbdFoodLimitMg(40)).toBe(3);
    expect(cbdFoodLimitMg(1000)).toBe(75);
    expect(validateProduct({ ...coffee, cbdMgPerPack: 18 })).toEqual([]);
    expect(validateProduct({ ...coffee, cbdMgPerPack: 19 })).toEqual(["CBD food & drink may hold at most 18.75 mg CBD in 250 g (0.0075%)"]);
    expect(validateProduct({ ...coffee, cbdMgPerPack: 75, netContent: 1000 })).toEqual([]);
    expect(validateProduct({ ...coffee, cbdMgPerPack: 76, netContent: 1000 })).toEqual(["CBD food & drink may hold at most 75 mg CBD in 1000 g (0.0075%)"]);
    // Drinks: a millilitre counts as a gram.
    expect(validateProduct({ ...coffee, cbdMgPerPack: 38, netContent: 500, netUnit: "ml" })).toEqual(["CBD food & drink may hold at most 37.5 mg CBD in 500 ml (0.0075%)"]);
    expect(validateProduct({ ...coffee, cbdMgPerPack: null })).toEqual(["CBD per pack (mg) is required"]);
  });

  it("holds only the CBD naturally in its ingredients, and THC at most 0.001%", () => {
    expect(validateProduct({ ...coffee, naturalCbd: false })).toEqual(["CBD food & drink may only hold the CBD naturally in its ingredients: tick to confirm none is added"]);
    expect(validateProduct({ ...coffee, thcMax: null })).toEqual(["Maximum THC (%) is required: CBD food & drink may contain at most 0.001%"]);
    expect(validateProduct({ ...coffee, thcMax: 0.01 })).toEqual(["CBD food & drink may contain at most 0.001% THC"]);
  });

  it("needs its net content (the limit is worked out from it), ingredients and allergens", () => {
    expect(validateProduct({ ...coffee, netContent: null })).toEqual(["Net content is required (g or ml): the CBD limit is worked out from it"]);
    expect(validateProduct({ ...coffee, netContent: 0 })).toEqual(["Net content is required (g or ml): the CBD limit is worked out from it"]);
    expect(validateProduct({ ...coffee, netUnit: "oz" })).toEqual(["Choose g or ml for the net content"]);
    expect(validateProduct({ ...coffee, ingredients: null })).toEqual(["List the ingredients: members see them on the product page and at the till"]);
    expect(validateProduct({ ...coffee, allergens: null })).toEqual(["Declare allergens: tick each major allergen it contains, or “No major allergens”"]);
    expect(validateProduct({ ...coffee, allergens: ["milk", "soybeans"] })).toEqual([]);
  });
});

describe("CBD skin care", () => {
  it("keeps THC at most 0.001%, lists its ingredients and net content, and has no daily dose", () => {
    expect(validateProduct(cream)).toEqual([]);
    expect(validateProduct({ ...cream, cbdMgPerPack: null })).toEqual([]); // CBD per pack is optional on skin care
    expect(validateProduct({ ...cream, allergens: [] })).toEqual([]); // food allergens (R146) don't apply
    expect(validateProduct({ ...cream, thcMax: 0.2 })).toEqual(["CBD skin care may contain at most 0.001% THC"]);
    expect(validateProduct({ ...cream, thcMax: null })).toEqual(["Maximum THC (%) is required: CBD skin care may contain at most 0.001%"]);
    expect(validateProduct({ ...cream, cbdMgPerDay: 10 })).toEqual(["Skin care is applied, not taken: remove the daily dose"]);
    expect(validateProduct({ ...cream, ingredients: "" })).toEqual(["List the ingredients: members see them on the product page and at the till"]);
    expect(validateProduct({ ...cream, netContent: null })).toEqual(["Net content is required (g or ml)"]);
  });

  it("screens its claims", () => {
    expect(has(validateProduct({ ...cream, claims: ["Anti-ageing night cream"] }), /Claim "Anti-ageing night cream": Health claim/)).toBe(true);
    expect(has(validateProduct({ ...cream, claims: ["Heals eczema"] }), /Medicinal claim/)).toBe(true);
  });
});

describe("Supplements (no cannabis)", () => {
  it("declare no CBD at all, and nothing from the cannabis plant in the ingredients", () => {
    expect(validateProduct(collagen)).toEqual([]);
    const noCbd = "Supplements contain no CBD: remove the CBD amounts, or choose CBD food & drink or CBD supplements";
    expect(validateProduct({ ...collagen, cbdMgPerPack: 10 })).toEqual([noCbd]);
    expect(validateProduct({ ...collagen, cbdMgPerDay: 5 })).toEqual([noCbd]);
    expect(validateProduct({ ...collagen, naturalCbd: true })).toEqual([noCbd]);
    expect(validateProduct({ ...collagen, ingredients: "Whey protein (milk), hemp seed protein" })).toEqual(["Supplements are cannabis-free, but the ingredients mention “hemp”: choose a CBD class instead"]);
    expect(validateProduct({ ...collagen, ingredients: "Collagen peptides, CBD isolate" })).toEqual(["Supplements are cannabis-free, but the ingredients mention “CBD”: choose a CBD class instead"]);
  });

  it("carry net content, ingredients and allergens", () => {
    expect(validateProduct({ ...collagen, netContent: null, ingredients: null, allergens: [] })).toEqual([
      "Net content is required (g or ml)",
      "List the ingredients: members see them on the product page and at the till",
      "Declare allergens: tick each major allergen it contains, or “No major allergens”",
    ]);
  });

  it("aren't age-restricted by law, but are sold everywhere the store sells", () => {
    expect(DEFAULT_COMPLIANCE.ageRestricted).not.toContain("SUPPLEMENT");
    expect(DEFAULT_COMPLIANCE.ageRestricted).toEqual(expect.arrayContaining(["CBD_FOOD", "CBD_TOPICAL"]));
    for (const ch of ["POS", "COLLECT", "SAME_DAY", "COURIER"] as const) expect(DEFAULT_COMPLIANCE.channels[ch]).toEqual(expect.arrayContaining(["CBD_FOOD", "CBD_TOPICAL", "SUPPLEMENT"]));
  });
});

describe("allergens (R146) and product facts", () => {
  it("knows the R146 major allergens, and 'none' stands alone", () => {
    expect(Object.keys(ALLERGENS)).toEqual(["gluten", "crustaceans", "molluscs", "eggs", "fish", "milk", "peanuts", "soybeans", "tree_nuts", "none"]);
    expect(validateProduct({ ...collagen, allergens: ["none", "fish"] })).toEqual(["“No major allergens” can't be ticked together with an allergen"]);
    expect(validateProduct({ ...collagen, allergens: ["fish", "nuts"] })).toEqual(["Unknown allergen: nuts"]);
    expect(validateProduct({ ...collagen, allergens: ["nuts"] })).toEqual(["Unknown allergen: nuts", "Declare allergens: tick each major allergen it contains, or “No major allergens”"]);
  });

  it("says what a pack contains, plainly and in the R146 order", () => {
    expect(allergenStatement(["milk"])).toBe("Contains: milk");
    expect(allergenStatement(["soybeans", "milk", "tree_nuts", "gluten"])).toBe("Contains: cereals containing gluten, milk, soybeans, tree nuts");
    expect(allergenStatement(["none"])).toBe("No major allergens declared");
    expect(allergenStatement([])).toBeNull();
    expect(allergenStatement(null)).toBeNull();
    expect(declaresAllergens(["none"])).toBe(false);
    expect(declaresAllergens(["fish"])).toBe(true);
  });

  it("labels net content in g, kg, ml and l", () => {
    expect(netContentLabel(250, "g")).toBe("250 g");
    expect(netContentLabel(1000, "g")).toBe("1 kg");
    expect(netContentLabel(50, "ml")).toBe("50 ml");
    expect(netContentLabel(1500, "ml")).toBe("1.5 l");
    expect(netContentLabel(null, "g")).toBeNull();
    expect(netContentLabel(250, "oz")).toBeNull();
  });

  it("asks each class only for the facts that apply", () => {
    expect(PRODUCT_FACTS).toEqual({
      CBD: ["ingredients", "allergens"],
      CBD_FOOD: ["netContent", "ingredients", "allergens"],
      CBD_TOPICAL: ["netContent", "ingredients"],
      SUPPLEMENT: ["netContent", "ingredients", "allergens"],
    });
    for (const c of ["THC", "HEMP", "ACCESSORY", "APPAREL", "GROW"] as RegClass[]) expect(validateProduct({ regClass: c }), c).toEqual([]); // as before: no master-data rules
    expect(REG_CLASSES).toEqual(["THC", "CBD", "CBD_FOOD", "CBD_TOPICAL", "HEMP", "SUPPLEMENT", "ACCESSORY", "APPAREL", "GROW"]);
  });
});

describe("screenCopy: food and supplement claims (R146)", () => {
  it("flags boosts, detox, fat-burning, anti-ageing, immunity, weight loss, slimming and metabolism", () => {
    for (const bad of [
      "Boosts your energy", "A morning booster", "Detox tea", "Detoxifying blend", "Burns fat while you work", "Fat-burning coffee", "Anti-ageing collagen", "Anti-aging formula",
      "Supports immunity", "For a strong immune system", "Weight loss shake", "Helps you lose weight", "Slimming tea", "Speeds up your metabolism", "Metabolic support",
    ]) {
      const flags = screenCopy(bad);
      expect(flags.map((f) => f.reason).join(" | "), bad).toMatch(/Health claim\. Foods and supplements/);
    }
  });

  it("leaves plain food copy and existing names alone", () => {
    for (const ok of [
      "Unbleached King Size Slim Papers", "Whey protein for training days and busy mornings", "Caffeine-free rooibos for the evening", "Supports everyday calm",
      "Soothes tired muscles after exercise", "Nourishes and softens skin", "Double Points this weekend on all CBD wellness", "About 30 servings a tub",
    ])
      expect(screenCopy(ok), ok).toEqual([]);
  });
});

describe("demo catalogue (prisma/seed-data)", () => {
  it("every product meets its class rules, and what the shop advertises passes the copy screen", () => {
    for (const p of PRODUCTS) {
      const reg = p.reg as RegClass;
      const issues = validateProduct({
        regClass: reg, cbdMgPerPack: p.cbdPack ?? null, cbdMgPerDay: reg === "CBD" ? (p.cbdDay ?? null) : null, thcMax: p.thc?.[1] ?? (CBD_CLASSES.includes(reg) ? THC_CAP_PCT : null),
        claims: p.claims, netContent: p.net?.[0] ?? null, netUnit: p.net?.[1] ?? null, ingredients: p.ingredients ?? null, allergens: p.allergens ?? [], naturalCbd: p.naturalCbd,
      });
      expect(issues, p.slug).toEqual([]);
      for (const c of p.claims ?? []) expect(screenCopy(c), `${p.slug}: ${c}`).toEqual([]);
      // Licensed medicines are never advertised (only patients see them), so their copy isn't marketing copy.
      if (!DEFAULT_COMPLIANCE.licensedOnly.includes(reg)) expect(screenCopy([p.name, p.tagline, p.desc].join(" ")), p.slug).toEqual([]);
    }
  });

  it("reclassifies honestly: CBD teas are food within 0.0075%, balms are skin care, oils and softgels stay CBD supplements", () => {
    const bySlug = (s: string) => PRODUCTS.find((p) => p.slug === s)!;
    const tea = bySlug("rooibos-cbd-tea");
    expect(tea.reg).toBe("CBD_FOOD");
    expect(tea.naturalCbd).toBe(true);
    expect(tea.cbdPack!).toBeLessThanOrEqual(cbdFoodLimitMg(tea.net![0]));
    expect(bySlug("recover-cbd-balm").reg).toBe("CBD_TOPICAL");
    expect(bySlug("recover-cbd-balm").cbdDay).toBeUndefined();
    for (const s of ["calm-cbd-oil-600", "rest-cbd-oil-300", "cbd-softgels"]) expect(bySlug(s).reg, s).toBe("CBD");
    const classes = new Set(PRODUCTS.map((p) => p.reg));
    for (const c of ["CBD_FOOD", "CBD_TOPICAL", "SUPPLEMENT"]) expect(classes.has(c as RegClass), c).toBe(true);
  });

  it("has the four wellness categories, each with a blurb that passes the screen and an icon the shop and tills render", () => {
    for (const slug of ["coffee-drinks", "protein-nutrition", "skin-care", "collagen-supplements"]) expect(CATEGORIES.some((c) => c.slug === slug), slug).toBe(true);
    for (const c of CATEGORIES) {
      expect(isCategoryIcon(c.icon), `${c.slug}: ${c.icon}`).toBe(true);
      expect(screenCopy(`${c.name} ${c.blurb}`), c.slug).toEqual([]);
      expect(PRODUCTS.some((p) => p.cat === c.slug), `${c.slug} has products`).toBe(true);
    }
  });
});
