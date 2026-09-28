"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getSettings, saveSetting, type Settings } from "@/server/settings";
import { runLossRules } from "@/server/loss";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str } from "@/server/hq/form";
import { parseRand, parseWhole } from "@/server/store/rules";
import { zarWhole } from "@/lib/money";

/** "2.5", "2,5" or "2.5×" → 2.5; null when it isn't a plain positive number. */
function decimal(raw: string) {
  const s = raw.replace(/\s/g, "").replace(/[×x%]$/i, "").replace(/^(\d+),(\d+)$/, "$1.$2");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

const changedKeys = (before: Record<string, number>, after: Record<string, number>) => Object.keys(after).filter((k) => before[k] !== after[k]);
const pick = (o: Record<string, number>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k]]));

/** Loss-prevention thresholds (settings.loss) and the banking rules the checks use (settings.banking). HQ admin only. */
export async function saveLossRules(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const rand = (k: string, min: number, max: number) => {
    const v = parseRand(str(fd, k));
    if (v == null || v < min || v > max) fields[k] = `From ${zarWhole(min)} to ${zarWhole(max)}`;
    return v ?? min;
  };
  const whole = (k: string, min: number, max: number) => {
    const v = parseWhole(str(fd, k), min, max);
    if (v == null) fields[k] = `A whole number from ${min} to ${max}`;
    return v ?? min;
  };
  const factor = (k: string) => {
    const v = decimal(str(fd, k));
    if (v == null || v <= 1 || v > 20) fields[k] = "More than 1 and at most 20 (times the norm)";
    return Math.round((v ?? 2) * 100) / 100;
  };
  const percent = (k: string) => {
    const v = decimal(str(fd, k));
    if (v == null || v < 1 || v > 100) fields[k] = "From 1% to 100%";
    return Math.round((v ?? 10) * 100) / 10_000; // 12.5% → 0.125
  };

  const loss: Settings["loss"] = {
    cashShortCents: rand("cashShort", 1_000, 1_000_000),
    cashShortHighCents: rand("cashShortHigh", 2_000, 10_000_000),
    repeatShorts: whole("repeatShorts", 2, 20),
    refundFactor: factor("refundFactor"),
    refundMin: whole("refundMin", 1, 100),
    quickRefundMinutes: whole("quickRefundMinutes", 1, 1_440),
    writeOffFactor: factor("writeOffFactor"),
    writeOffMinCents: rand("writeOffMin", 1_000, 100_000_000),
    memberRepeat: whole("memberRepeat", 2, 50),
    offlineFactor: factor("offlineFactor"),
    offlineMin: whole("offlineMin", 1, 1_000),
    refundedShare: percent("refundedShare"),
    refundedMin: whole("refundedMin", 1, 100),
  };
  const banking: Settings["banking"] = {
    dueBusinessDays: whole("dueBusinessDays", 1, 10),
    shortToleranceCents: rand("shortTolerance", 0, 1_000_000),
  };
  if (!fields.cashShort && !fields.cashShortHigh && loss.cashShortHighCents <= loss.cashShortCents) fields.cashShortHigh = "Must be more than the amount that raises an alert";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  const before = await getSettings();
  const lossChanged = changedKeys(before.loss, loss);
  const bankingChanged = changedKeys(before.banking, banking);
  if (!lossChanged.length && !bankingChanged.length) return done("No changes to save.");
  if (lossChanged.length) {
    await saveSetting("loss", loss);
    await audit(db, g.actor, "settings.loss", { entity: "Setting", entityId: "loss", data: { changed: lossChanged, before: pick(before.loss, lossChanged), after: pick(loss, lossChanged) } });
  }
  if (bankingChanged.length) {
    await saveSetting("banking", banking);
    await audit(db, g.actor, "settings.banking", { entity: "Setting", entityId: "banking", data: { changed: bankingChanged, before: pick(before.banking, bankingChanged), after: pick(banking, bankingChanged) } });
  }
  revalidatePath("/hq/loss-prevention");
  const n = lossChanged.length + bankingChanged.length;
  return done(`Saved ${n} change${n === 1 ? "" : "s"}. The next check uses them — tonight, at the next shift close or deposit, or run the checks now.`);
}

/** Runs every rule over recent trading now (the nightly job, on demand). Idempotent: alerts already raised are skipped. */
export async function runChecks(_: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  const g = await guard("admin");
  if (!g) return DENIED;
  let r: Awaited<ReturnType<typeof runLossRules>>;
  try {
    r = await runLossRules();
  } catch (e) {
    console.error("[loss] manual run failed", e);
    return fail("The checks didn't finish — try again in a minute.");
  }
  await audit(db, g.actor, "loss.run", { data: { found: r.found, raised: r.raised, digestEmails: r.digest.emails } });
  revalidatePath("/hq/loss-prevention");
  if (!r.raised) return done(`Checks run — no new alerts${r.found ? ` (${r.found} finding${r.found === 1 ? " was" : "s were"} already raised)` : ""}.`);
  return done(`Checks run — ${r.raised} new alert${r.raised === 1 ? "" : "s"} raised${r.digest.emails ? `, ${r.digest.emails} digest email${r.digest.emails === 1 ? "" : "s"} sent` : ""}.`);
}
