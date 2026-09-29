"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea, Checkbox, Label } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/hq/select";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import {
  ALLERGENS, ALLERGEN_KEYS, DEFAULT_LEGAL_BASIS, PRODUCT_FACTS, REG_CLASS_HINT, REG_CLASS_LABEL, REG_CLASSES, CBD_CLASSES, carriesFact, cbdFoodLimitMg, netContentLabel, screenCopy, validateProduct,
  type RegClass,
} from "@/lib/compliance";
import { slugify } from "@/server/hq/form";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";

export type ProductInput = {
  name: string; slug: string; tagline: string | null; description: string; brand: string; line: string | null; categoryId: string;
  status: string; strain: string | null; thcMin: number | null; thcMax: number | null; cbdMin: number | null; cbdMax: number | null;
  terpenes: { name: string; pct: number }[]; effects: string[]; flavours: string[]; lineage: string | null; origin: string | null;
  heritage: boolean; featured: boolean; regClass: string; legalBasis: string | null; cbdMgPerPack: number | null; cbdMgPerDay: number | null;
  claims: string[]; tobaccoRelated: boolean;
  netContent: number | null; netUnit: string | null; ingredients: string | null; allergens: string[]; naturalCbd: boolean;
};

// What a class carries on the form beyond the basics.
const PLANT: RegClass[] = ["THC", "CBD", "HEMP"]; // strain, potency ranges, terpenes
const WELLNESS: RegClass[] = ["CBD_FOOD", "CBD_TOPICAL", "SUPPLEMENT"]; // flavours and moods, no plant profile

const OK_TEXT: Partial<Record<RegClass, string>> = {
  CBD: "Within Schedule 0 limits",
  CBD_TOPICAL: "Ready to list: THC within 0.001%, facts complete",
  SUPPLEMENT: "Ready to list: cannabis-free, facts complete",
};

export function ProductForm({
  action,
  product,
  categories,
  claimLibrary,
  noIncentiveClasses,
  readOnly,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  product: ProductInput | null;
  categories: { id: string; name: string }[];
  claimLibrary: string[];
  noIncentiveClasses: RegClass[]; // incentiveExcluded(settings): no promotions, points or commission (s18A)
  readOnly?: boolean;
}) {
  const p = product;
  const [name, setName] = useState(p?.name ?? "");
  const [slug, setSlug] = useState(p?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!p);
  const [regClass, setRegClass] = useState<RegClass>((p?.regClass as RegClass) ?? "CBD");
  const [perPack, setPerPack] = useState(p?.cbdMgPerPack?.toString() ?? "");
  const [perDay, setPerDay] = useState(p?.cbdMgPerDay?.toString() ?? "");
  const [thcMax, setThcMax] = useState(p?.thcMax?.toString() ?? "");
  const [netContent, setNetContent] = useState(p?.netContent?.toString() ?? "");
  const [netUnit, setNetUnit] = useState(p?.netUnit ?? "g");
  const [ingredients, setIngredients] = useState(p?.ingredients ?? "");
  const [allergens, setAllergens] = useState<string[]>(p?.allergens ?? []);
  const [naturalCbd, setNaturalCbd] = useState(p?.naturalCbd ?? false);
  const [claims, setClaims] = useState<string[]>(p?.claims.length ? p.claims : [""]);
  const [terps, setTerps] = useState<{ name: string; pct: string }[]>(p?.terpenes.length ? p.terpenes.map((t) => ({ name: t.name, pct: String(t.pct) })) : []);
  const [legalBasis, setLegalBasis] = useState(p?.legalBasis ?? DEFAULT_LEGAL_BASIS.CBD ?? "");

  const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
  const plant = PLANT.includes(regClass);
  const wellness = WELLNESS.includes(regClass);
  const facts = PRODUCT_FACTS[regClass];
  const ruled = !!facts; // classes with master-data rules: checked live and again on save
  const capped = CBD_CLASSES.includes(regClass);
  const issues = useMemo(
    () =>
      validateProduct({
        regClass,
        cbdMgPerPack: CBD_CLASSES.includes(regClass) ? num(perPack) : null,
        cbdMgPerDay: regClass === "CBD" ? num(perDay) : null,
        thcMax: plant || capped ? num(thcMax) : null,
        claims: claims.filter(Boolean),
        netContent: carriesFact(regClass, "netContent") ? num(netContent) : null,
        netUnit,
        ingredients,
        allergens,
        naturalCbd: regClass === "CBD_FOOD" && naturalCbd,
      }),
    [regClass, perPack, perDay, thcMax, claims, netContent, netUnit, ingredients, allergens, naturalCbd, plant, capped],
  );
  const net = num(netContent);
  const foodLimit = regClass === "CBD_FOOD" && net != null && net > 0 ? cbdFoodLimitMg(net) : null;
  const okText =
    regClass === "CBD_FOOD"
      ? `Within the CBD food limit: ${num(perPack) ?? 0} mg of the ${Math.round((foodLimit ?? 0) * 100) / 100} mg allowed in ${netContentLabel(net, netUnit) ?? "the pack"}`
      : (OK_TEXT[regClass] ?? "Ready to list");
  const toggleAllergen = (k: string, on: boolean) =>
    setAllergens((a) => (k === "none" ? (on ? ["none"] : []) : on ? [...a.filter((x) => x !== "none" && x !== k), k] : a.filter((x) => x !== k)));

  const thcMaxField = (
    <Field label="THC max %" htmlFor="thcMax" hint={capped ? "At most 0.001%" : undefined}>
      <Input id="thcMax" name="thcMax" value={thcMax} onChange={(e) => setThcMax(e.target.value)} inputMode="decimal" placeholder={capped ? "0.001" : undefined} />
      <FieldError name="thcMax" />
    </Field>
  );
  const moodFields = (
    <>
      <Field label={plant ? "Effects" : "Moods"} htmlFor="effects" hint={plant ? "Comma separated, e.g. uplifted, focused" : "Comma separated: calm, focus, rest or recover (occasions, not claims)"}>
        <Input id="effects" name="effects" defaultValue={p?.effects.join(", ") ?? ""} />
      </Field>
      <Field label="Flavours" htmlFor="flavours" hint="Comma separated">
        <Input id="flavours" name="flavours" defaultValue={p?.flavours.join(", ") ?? ""} />
      </Field>
    </>
  );

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-6 xl:grid-cols-3" noticeClassName="xl:col-span-3">
      <fieldset disabled={readOnly} className="min-w-0 contents">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Product" description="What everyone sees in the shop, the app and on the menu board" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" value={name} onChange={(e) => (setName(e.target.value), !slugTouched && setSlug(slugify(e.target.value)))} required />
                <FieldError name="name" />
              </Field>
              <Field label="URL slug" htmlFor="slug" hint={`/p/${slug || "…"}`}>
                <Input id="slug" name="slug" value={slug} onChange={(e) => (setSlug(e.target.value), setSlugTouched(true))} className="font-mono text-[0.8rem]" />
                <FieldError name="slug" />
              </Field>
              <Field label="Tagline" htmlFor="tagline" className="sm:col-span-2">
                <Input id="tagline" name="tagline" defaultValue={p?.tagline ?? ""} placeholder="One warm line — no medical claims" />
              </Field>
              <Field label="Description" htmlFor="description" className="sm:col-span-2">
                <Textarea id="description" name="description" defaultValue={p?.description ?? ""} className="min-h-28" />
                <FieldError name="description" />
              </Field>
              <Field label="Category" htmlFor="categoryId">
                <Select id="categoryId" name="categoryId" defaultValue={p?.categoryId ?? ""}>
                  <option value="" disabled>Choose…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <FieldError name="categoryId" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Line" htmlFor="line">
                  <Select id="line" name="line" defaultValue={p?.line ?? "HOUSE"}>
                    {["HOUSE", "HERITAGE", "CLASSIC", "RESERVE", "PARTNER"].map((l) => (
                      <option key={l} value={l}>{l.charAt(0) + l.slice(1).toLowerCase()}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue={p?.status ?? "DRAFT"}>
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                  </Select>
                </Field>
              </div>
              <Field label="Brand" htmlFor="brand">
                <Input id="brand" name="brand" defaultValue={p?.brand ?? "Herbal Holland"} />
              </Field>
              <div className="flex flex-wrap items-end gap-6 pb-2">
                <Checkbox name="heritage" defaultChecked={p?.heritage} label="Heritage" description="African landrace story" />
                <Checkbox name="featured" defaultChecked={p?.featured} label="Featured" description="Shop & app highlights" />
              </div>
            </CardBody>
          </Card>

          {facts && (
            <Card>
              <CardHeader title="Product facts" description="Required before it can be listed. Members see them on the product page and at the till." />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                {carriesFact(regClass, "netContent") && (
                  <div>
                    <Label htmlFor="netContent">Net content</Label>
                    <div className="flex gap-2">
                      <Input id="netContent" name="netContent" value={netContent} onChange={(e) => setNetContent(e.target.value)} inputMode="decimal" placeholder="250" className="min-w-0" />
                      <Select name="netUnit" aria-label="Net content unit" value={netUnit} onChange={(e) => setNetUnit(e.target.value)} wrapperClassName="w-24 shrink-0">
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                      </Select>
                    </div>
                    <p className="mt-1.5 text-xs text-ink-500">One pack, as on the label{regClass === "CBD_FOOD" ? " — the CBD limit is worked out from it" : ""}</p>
                    <FieldError name="netContent" />
                  </div>
                )}
                <Field label="Ingredients" htmlFor="ingredients" hint="As on the label, in descending order of weight" className="sm:col-span-2">
                  <Textarea id="ingredients" name="ingredients" value={ingredients} onChange={(e) => setIngredients(e.target.value)} className="min-h-20" />
                  <FieldError name="ingredients" />
                </Field>
                {carriesFact(regClass, "allergens") && (
                  <fieldset className="sm:col-span-2">
                    <legend className="mb-1.5 block text-[0.78rem] font-semibold text-ink-700">Allergens (R146)</legend>
                    <p className="mb-2 text-xs text-ink-500">Tick every major allergen it contains — or “No major allergens”, on its own.</p>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
                      {ALLERGEN_KEYS.map((k) => (
                        <Checkbox
                          key={k}
                          name="allergens"
                          value={k}
                          checked={allergens.includes(k)}
                          onChange={(e) => toggleAllergen(k, e.target.checked)}
                          label={ALLERGENS[k]}
                          className={k === "none" ? "sm:col-span-3 border-t border-ink-100 pt-2" : undefined}
                        />
                      ))}
                    </div>
                  </fieldset>
                )}
              </CardBody>
            </Card>
          )}

          {plant && (
            <Card>
              <CardHeader title="Plant profile" description="Typical ranges — each batch's lab results are recorded on the batch" />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field label="Strain type" htmlFor="strain">
                  <Select id="strain" name="strain" defaultValue={p?.strain ?? ""}>
                    <option value="">Not applicable</option>
                    <option value="SATIVA">Sativa</option>
                    <option value="INDICA">Indica</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="CBD">CBD-dominant</option>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Origin" htmlFor="origin">
                    <Input id="origin" name="origin" defaultValue={p?.origin ?? ""} placeholder="Durban, KZN" />
                  </Field>
                  <Field label="Lineage" htmlFor="lineage">
                    <Input id="lineage" name="lineage" defaultValue={p?.lineage ?? ""} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="THC min %" htmlFor="thcMin">
                    <Input id="thcMin" name="thcMin" defaultValue={p?.thcMin ?? ""} inputMode="decimal" />
                    <FieldError name="thcMin" />
                  </Field>
                  {thcMaxField}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CBD min %" htmlFor="cbdMin">
                    <Input id="cbdMin" name="cbdMin" defaultValue={p?.cbdMin ?? ""} inputMode="decimal" />
                  </Field>
                  <Field label="CBD max %" htmlFor="cbdMax">
                    <Input id="cbdMax" name="cbdMax" defaultValue={p?.cbdMax ?? ""} inputMode="decimal" />
                    <FieldError name="cbdMax" />
                  </Field>
                </div>
                {moodFields}
                <div className="sm:col-span-2">
                  <Label>Terpenes</Label>
                  <div className="space-y-2">
                    {terps.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input name="terpName" aria-label={`Terpene ${i + 1}`} value={t.name} onChange={(e) => setTerps(terps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Myrcene" />
                        <div className="relative w-28 shrink-0">
                          <Input name="terpPct" aria-label={`Terpene ${i + 1} %`} value={t.pct} onChange={(e) => setTerps(terps.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} inputMode="decimal" className="pr-7" />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">%</span>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setTerps(terps.filter((_, j) => j !== i))} aria-label="Remove terpene">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setTerps([...terps, { name: "", pct: "" }])}>
                      <Plus className="h-4 w-4" /> Add terpene
                    </Button>
                    <FieldError name="terpenes" />
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {wellness && (
            <Card>
              <CardHeader title="Flavours & moods" description="Help members find it: flavours on the product page, moods in the shop's mood browse" />
              <CardBody className="grid gap-4 sm:grid-cols-2">{moodFields}</CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className={cn(ruled && issues.length > 0 && "border-rose-500/40")}>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-700" /> Compliance master data
                </span>
              }
              description="Drives what can be sold, where, and how it may be marketed"
            />
            <CardBody className="space-y-4">
              <Field label="Regulatory class" htmlFor="regClass">
                <Select
                  id="regClass"
                  name="regClass"
                  value={regClass}
                  onChange={(e) => {
                    const c = e.target.value as RegClass;
                    setRegClass(c);
                    if (!legalBasis || Object.values(DEFAULT_LEGAL_BASIS).includes(legalBasis)) setLegalBasis(DEFAULT_LEGAL_BASIS[c] ?? "");
                  }}
                  aria-describedby="regClass-hint"
                >
                  {REG_CLASSES.map((c) => (
                    <option key={c} value={c} title={REG_CLASS_HINT[c]}>{REG_CLASS_LABEL[c]}</option>
                  ))}
                </Select>
                <p id="regClass-hint" className="mt-1.5 text-xs text-ink-500">{REG_CLASS_HINT[regClass]}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink-700">
                  {noIncentiveClasses.includes(regClass) ? (
                    <>
                      <Lock className="h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden /> No promotions, points or commission (Medicines Act s18A)
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-leaf-600" aria-hidden /> Promotions and points allowed
                    </>
                  )}
                </p>
                <FieldError name="regClass" />
              </Field>
              {regClass === "THC" && <p className="rounded-xl bg-[#f1effb] px-3 py-2 text-xs text-[#4a3aa7]">Licence-gated: only stores holding a THC licence can sell it, and in medical mode only to patients with an active authorisation, dispensed by an authorised dispenser. No promotions, member prices or reward points apply (Medicines Act s18A).</p>}
              <Field label="Legal basis" htmlFor="legalBasis" hint="Shown on the product page and in audits">
                <Input id="legalBasis" name="legalBasis" value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} />
              </Field>
              {regClass === "CBD" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CBD per pack (mg)" htmlFor="cbdMgPerPack" hint="Schedule 0: ≤ 600 mg">
                    <Input id="cbdMgPerPack" name="cbdMgPerPack" value={perPack} onChange={(e) => setPerPack(e.target.value)} inputMode="numeric" />
                    <FieldError name="cbdMgPerPack" />
                  </Field>
                  <Field label="Max daily dose (mg)" htmlFor="cbdMgPerDay" hint="Schedule 0: ≤ 20 mg">
                    <Input id="cbdMgPerDay" name="cbdMgPerDay" value={perDay} onChange={(e) => setPerDay(e.target.value)} inputMode="decimal" />
                  </Field>
                </div>
              )}
              {(regClass === "CBD_FOOD" || regClass === "CBD_TOPICAL") && (
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label={regClass === "CBD_FOOD" ? "CBD per pack (mg)" : "CBD per pack (mg, optional)"}
                    htmlFor="cbdMgPerPack"
                    hint={regClass === "CBD_FOOD" ? (foodLimit != null ? `At most ${Math.round(foodLimit * 100) / 100} mg (0.0075%)` : "At most 0.0075% of net content") : "As on the label"}
                  >
                    <Input id="cbdMgPerPack" name="cbdMgPerPack" value={perPack} onChange={(e) => setPerPack(e.target.value)} inputMode="numeric" />
                    <FieldError name="cbdMgPerPack" />
                  </Field>
                  {thcMaxField}
                </div>
              )}
              {regClass === "CBD_FOOD" && (
                <Checkbox
                  name="naturalCbd"
                  checked={naturalCbd}
                  onChange={(e) => setNaturalCbd(e.target.checked)}
                  label="Only the CBD naturally in its ingredients"
                  description="No CBD is added (no isolate or distillate): GN 586 allows only what the hemp in the recipe brings."
                />
              )}
              {regClass === "SUPPLEMENT" && <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">Cannabis-free: no CBD, THC or hemp in the ingredients. Not age-restricted by law — our stores sell to adults only anyway.</p>}
              <div>
                <Label>Approved claims</Label>
                <p className="mb-2 text-xs text-ink-500">Low-risk wellness claims only (general health, relief of minor symptoms). Each claim is screened as you type.</p>
                <datalist id="claim-library">
                  {claimLibrary.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <div className="space-y-2">
                  {claims.map((c, i) => {
                    const flags = c.trim() ? screenCopy(c) : [];
                    return (
                      <div key={i}>
                        <div className="flex items-center gap-2">
                          <Input
                            name="claim"
                            list="claim-library"
                            aria-label={`Claim ${i + 1}`}
                            value={c}
                            onChange={(e) => setClaims(claims.map((x, j) => (j === i ? e.target.value : x)))}
                            className={cn(flags.length > 0 && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
                            placeholder="e.g. Supports a restful wind-down"
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => setClaims(claims.length > 1 ? claims.filter((_, j) => j !== i) : [""])} aria-label="Remove claim">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {flags.map((f) => (
                          <p key={f.term} className="mt-1 text-xs font-medium text-rose-600">
                            “{f.term}” — {f.reason}
                          </p>
                        ))}
                      </div>
                    );
                  })}
                  <Button type="button" variant="outline" size="sm" onClick={() => setClaims([...claims, ""])}>
                    <Plus className="h-4 w-4" /> Add claim
                  </Button>
                  <FieldError name="claims" />
                </div>
              </div>
              <Checkbox
                name="tobaccoRelated"
                defaultChecked={p?.tobaccoRelated}
                label="Tobacco Bill related product"
                description="Pipes, water-pipes, papers, vapes. If B33-2022 mode is switched on: in-store only, no loyalty, no promotion."
              />
              <div aria-live="polite">
                {ruled &&
                  (issues.length ? (
                    <div className="rounded-xl border border-rose-500/25 bg-rose-50 p-3 text-sm text-rose-600">
                      <div className="mb-1 flex items-center gap-1.5 font-semibold">
                        <AlertTriangle className="h-4 w-4" /> Can&apos;t be saved yet
                      </div>
                      <ul className="list-disc space-y-0.5 pl-5 text-xs">
                        {issues.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-leaf-500/25 bg-leaf-50 p-3 text-sm font-medium text-leaf-700">
                      <CheckCircle2 className="h-4 w-4 shrink-0" /> {okText}
                    </div>
                  ))}
                <FieldError name="compliance" />
              </div>
            </CardBody>
          </Card>
          {!readOnly && (
            <div className="flex justify-end">
              <SubmitButton size="lg" disabled={ruled && issues.length > 0} pendingLabel="Saving…">
                {product ? "Save product" : "Create product"}
              </SubmitButton>
            </div>
          )}
        </div>
      </fieldset>
    </ActionForm>
  );
}
