"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getSettings, saveSetting } from "@/server/settings";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str, parsePctToBps } from "@/server/hq/form";
import { incentiveExcluded, REG_CLASS_LABEL, type RegClass } from "@/lib/compliance";

const CLASSES = Object.keys(REG_CLASS_LABEL) as RegClass[];
const MAX_BPS = 1_000; // 10%

/** Network commission rates (basis points per product class). Licensed medicines stay at 0% (Medicines Act s18A). */
export async function saveCommissionRates(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const settings = await getSettings();
  const excluded = incentiveExcluded(settings.compliance);
  const fields: Record<string, string> = {};
  const next = {} as Record<RegClass, number>;
  for (const c of CLASSES) {
    if (excluded.includes(c)) {
      next[c] = 0;
      continue;
    }
    const v = parsePctToBps(str(fd, `rate_${c}`));
    if (v == null || v > MAX_BPS) fields[`rate_${c}`] = "0–10%, up to two decimals";
    else next[c] = v;
  }
  if (Object.keys(fields).length) return fail("Check the highlighted rates.", fields);
  const before = settings.commission.bps;
  const changed = CLASSES.filter((c) => (before[c] ?? 0) !== next[c]);
  if (!changed.length) return done("No changes to save.");
  await saveSetting("commission", { ...settings.commission, bps: next });
  await audit(db, g.actor, "settings.commission", {
    entity: "Setting",
    entityId: "commission",
    data: { before: Object.fromEntries(changed.map((c) => [c, before[c] ?? 0])), after: Object.fromEntries(changed.map((c) => [c, next[c]])) },
  });
  revalidatePath("/hq/commission");
  return done(`Rates saved (${changed.map((c) => `${c} ${next[c] / 100}%`).join(", ")}). Every store's unapproved months use them straight away; approved months don't change.`);
}
