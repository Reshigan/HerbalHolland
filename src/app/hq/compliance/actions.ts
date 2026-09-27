"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getSettings, saveSetting } from "@/server/settings";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str, list, bool, opt, parseInt10, parseNum } from "@/server/hq/form";
import type { ComplianceSettings, RegClass, SellChannel, ThcMode } from "@/lib/compliance";

const CLASSES: RegClass[] = ["THC", "CBD", "HEMP", "ACCESSORY", "APPAREL", "GROW"];
const CHANNELS: SellChannel[] = ["POS", "COLLECT", "SAME_DAY", "COURIER"];
const classes = (fd: FormData, name: string) => list(fd, name).filter((c): c is RegClass => CLASSES.includes(c as RegClass));

export async function saveCompliance(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const thcMode = str(fd, "thcMode") as ThcMode;
  if (thcMode !== "MEDICAL" && thcMode !== "ADULT_USE") fields.thcMode = "Choose a mode";
  const minAge = parseInt10(str(fd, "minAge"));
  if (minAge == null || minAge < 18 || minAge > 25) fields.minAge = "Between 18 and 25 — never below 18";
  const dailyLimitGrams = parseNum(str(fd, "dailyLimitGrams"));
  if (dailyLimitGrams == null || dailyLimitGrams <= 0 || dailyLimitGrams > 750) fields.dailyLimitGrams = "Between 0 and 750 g";
  if (thcMode === "ADULT_USE" && str(fd, "confirmAdult") !== "ADULT USE") fields.confirmAdult = "Type ADULT USE to confirm the switch";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  const before = (await getSettings()).compliance;
  const next: ComplianceSettings = {
    thcMode,
    minAge: minAge!,
    dailyLimitGrams: dailyLimitGrams!,
    licensedOnly: classes(fd, "licensedOnly"),
    ageRestricted: classes(fd, "ageRestricted"),
    channels: Object.fromEntries(CHANNELS.map((c) => [c, classes(fd, `ch_${c}`)])) as ComplianceSettings["channels"],
    tobaccoBillMode: bool(fd, "tobaccoBillMode"),
  };
  // Guardrails: the licence gate and the 18+ check on licensed classes can't be switched off from here.
  if (!next.licensedOnly.includes("THC")) return fail("THC must stay licence-gated. Commercial THC trade needs a licence under any current or proposed regime.");
  for (const c of next.licensedOnly) if (!next.ageRestricted.includes(c)) next.ageRestricted.push(c);

  const changed = (Object.keys(next) as (keyof ComplianceSettings)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]));
  if (!changed.length) return done("No changes to save.");
  await saveSetting("compliance", next);
  await audit(db, g.actor, "compliance.settings", {
    entity: "Setting", entityId: "compliance",
    data: { changed, before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) },
  });
  revalidatePath("/hq/compliance");
  return done(`Compliance rules saved (${changed.join(", ")}). Tills and the web shop use them on the next basket.`);
}

export async function saveLicences(storeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const store = await db.store.findUnique({ where: { id: storeId }, select: { code: true, licences: true, licenceRef: true } });
  if (!store) return fail("Store not found.");
  const licences = classes(fd, "licences");
  const licenceRef = opt(fd, "licenceRef");
  if (licences.length && !licenceRef) return fail("Record the licence or permit number — it prints on receipts and invoices.", { licenceRef: "Required when a licence is held" });
  const added = licences.filter((l) => !store.licences.includes(l));
  const removed = store.licences.filter((l) => !licences.includes(l));
  if (!added.length && !removed.length && licenceRef === store.licenceRef) return done("No changes to save.");
  await db.store.update({ where: { id: storeId }, data: { licences, licenceRef } });
  await audit(db, g.actor, "compliance.licence", { storeId, entity: "Store", entityId: storeId, data: { added, removed, licenceRef } });
  revalidatePath("/hq/compliance");
  revalidatePath(`/hq/stores/${store.code}`);
  return done(removed.length ? `Licence removed: ${removed.join(", ")}. Those products are blocked at this store immediately.` : "Licences saved.");
}
