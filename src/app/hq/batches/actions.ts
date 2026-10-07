"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { notifyCustomer } from "@/server/messaging";
import { guard, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { affectedCustomers } from "@/server/hq/batches";
import { str, opt, parseNum } from "@/server/hq/form";
import type { Prisma } from "@/generated/prisma/client";

const RESULTS = ["PASS", "FAIL", "PENDING", "N/A"];

export async function saveLabResults(batchId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const pct = (k: string) => {
    const v = parseNum(str(fd, k));
    if (v != null && (v < 0 || v > 100)) fields[k] = "0–100%";
    return v;
  };
  const thc = pct("thc"), cbd = pct("cbd"), moisturePct = pct("moisturePct");
  const panel = Object.fromEntries(["microbials", "mycotoxins", "pesticides", "heavyMetals", "residualSolvents"].map((k) => [k, RESULTS.includes(str(fd, k)) ? str(fd, k) : "PENDING"]));
  const terpenes = fd.getAll("terpName").map((n, i) => ({ name: String(n).trim(), pct: parseNum(String(fd.getAll("terpPct")[i] ?? "")) })).filter((t) => t.name && t.pct != null);
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const batch = await db.batch.findUnique({ where: { id: batchId } });
  if (!batch) return fail("Batch not found.");
  const labResults = { ...((batch.labResults as Record<string, unknown>) ?? {}), ...panel, moisturePct, terpenes } as Prisma.InputJsonValue;
  await db.batch.update({ where: { id: batchId }, data: { thc, cbd, labName: opt(fd, "labName"), coaRef: opt(fd, "coaRef"), labResults } });
  const failed = Object.entries(panel).filter(([, v]) => v === "FAIL").map(([k]) => k);
  await audit(db, g.actor, "batch.lab_results", { entity: "Batch", entityId: batchId, data: { code: batch.code, thc, cbd, coaRef: opt(fd, "coaRef"), failed } });
  revalidatePath(`/hq/batches/${batchId}`);
  return done(failed.length && batch.status === "RELEASED" ? `Saved. ${failed.join(", ")} failed, so quarantine the batch below.` : "Lab results saved.");
}

export async function setBatchStatus(batchId: string, to: "QUARANTINE" | "RELEASED" | "RECALLED", _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const batch = await db.batch.findUnique({ where: { id: batchId }, include: { variant: { include: { product: { select: { name: true } } } } } });
  if (!batch) return fail("Batch not found.");
  const reason = str(fd, "reason");
  if (to !== "RELEASED" && reason.length < 5) return fail("Give a reason. It's shown to stores and kept on the audit trail.", { reason: "Required" });
  if (to === "RELEASED" && batch.status !== "QUARANTINE") return fail(batch.status === "RECALLED" ? "A recalled batch can't be released." : "Only quarantined batches can be released.");
  if (to === "QUARANTINE" && batch.status !== "RELEASED") return fail("Only released batches can be quarantined.");
  if (to === "RECALLED") {
    if (batch.status === "RECALLED") return fail("This batch is already recalled.");
    if (str(fd, "confirm").toUpperCase() !== batch.code.toUpperCase()) return fail(`Type the batch code ${batch.code} to confirm the recall.`);
  }

  await db.batch.update({ where: { id: batchId }, data: { status: to, statusReason: to === "RELEASED" ? (reason || "Released after review") : reason } });
  const name = `${batch.variant.product.name} · ${batch.variant.name}`;
  let notified = 0;
  let announcementId: string | undefined;
  if (to === "RECALLED") {
    const a = await db.announcement.create({
      data: {
        kind: "RECALL",
        audience: "ALL",
        requiresAck: true,
        title: `Recall: ${name}, batch ${batch.code}`,
        body: `Stop selling batch ${batch.code} of ${name} immediately. Reason: ${reason}\n\nThe tills and web shop already block this batch. Count what you hold, keep it aside, and return it on your next stock order or book it out as RECALL. Members who bought it have been contacted by SMS.`,
      },
    });
    announcementId = a.id;
    const customers = await affectedCustomers(batch);
    const msg = `Herbal Holland: important product notice. Please stop using ${name} (batch ${batch.code}) and return it to any Herbal Holland store for a full refund. Reason: ${reason}`;
    for (let i = 0; i < customers.length; i += 50) {
      await Promise.all(customers.slice(i, i + 50).map((c) => notifyCustomer(c, msg)));
    }
    notified = customers.length;
  }
  const action = { QUARANTINE: "batch.quarantine", RELEASED: "batch.release", RECALLED: "batch.recall" }[to];
  await audit(db, g.actor, action, { entity: "Batch", entityId: batchId, data: { code: batch.code, from: batch.status, reason, notified, announcementId } });
  revalidatePath(`/hq/batches/${batchId}`);
  revalidatePath("/hq/batches");
  if (to === "RECALLED") flashTo(`/hq/batches/${batchId}`, `Batch recalled. ${notified} member${notified === 1 ? "" : "s"} notified by SMS and every store has a recall notice to acknowledge.`);
  flashTo(`/hq/batches/${batchId}`, to === "QUARANTINE" ? "Batch quarantined. It can't be sold or shipped until released." : "Batch released for sale.");
}
