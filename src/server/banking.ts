// Cash banking: the cash from closed cash-ups goes to the bank, and every deposit carries a photo or PDF of the
// stamped slip. The owner or HQ checks each deposit against the bank statement (verified — then locked) or queries it.
import { createHash, randomUUID } from "node:crypto";
import { db, tx } from "./db";
import { audit, type Actor } from "./audit";
import { nextNumber } from "./counters";
import { getSettings } from "./settings";
import { putObject } from "./storage";
import { raiseAlerts, type NewAlert } from "./loss";
import { queuePosting } from "./ledger/core";
import { bankBy, cashToBank, isOverdue } from "@/lib/banking";
import { extFor, MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";
import { dayKey } from "@/lib/format";
import { zar } from "@/lib/money";
import type { Role } from "@/generated/prisma/client";

export class BankingError extends Error {}

/** Checks a deposit: never the person who recorded it. */
export const canVerify = (role: Role) => ["OWNER", "AREA_MANAGER", "HQ_ADMIN", "HQ_STAFF"].includes(role);

/** Closed cash-ups whose cash hasn't been banked, oldest first, with what each hands over and by when. */
export async function waitingCash(storeId: string, now = new Date()) {
  const { banking } = await getSettings();
  const shifts = await db.shift.findMany({ where: { storeId, depositId: null, closedAt: { not: null }, countedCashCents: { not: null } }, orderBy: { closedAt: "asc" }, take: 200 });
  return shifts
    .map((s) => ({ ...s, cashCents: cashToBank(s), dueOn: bankBy(s.closedAt!, banking.dueBusinessDays), overdue: isOverdue(s.closedAt!, banking.dueBusinessDays, now) }))
    .filter((s) => s.cashCents > 0);
}

export async function recordDeposit(
  a: { storeId: string; storeCode: string; shiftIds: string[]; amountCents: number; bankedOn: Date; reference: string; note?: string | null; file: File },
  actor: Actor & { id: string },
) {
  if (!a.shiftIds.length) throw new BankingError("Tick the cash-ups this deposit covers");
  if (!a.file.size) throw new BankingError("Add a photo or PDF of the stamped deposit slip");
  if (a.file.size > MAX_UPLOAD_BYTES) throw new BankingError("The slip is over 10 MB — take the photo again or use a smaller PDF");
  const bytes = new Uint8Array(await a.file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type) throw new BankingError("The slip must be a photo (JPEG, PNG, HEIC or WebP) or a PDF");
  const shifts = await db.shift.findMany({ where: { id: { in: a.shiftIds }, storeId: a.storeId, depositId: null, closedAt: { not: null }, countedCashCents: { not: null } } });
  if (shifts.length !== new Set(a.shiftIds).size) throw new BankingError("Some of those cash-ups are already banked — refresh and try again");
  const expected = shifts.reduce((t, s) => t + cashToBank(s), 0);

  const key = `slips/${a.storeCode}/${dayKey(a.bankedOn).slice(0, 7)}/${randomUUID()}.${extFor(type)}`;
  await putObject(key, bytes, type);
  const deposit = await tx(async (t) => {
    const n = await nextNumber(t, "DEPOSIT");
    const slip = await t.upload.create({
      data: { key, fileName: a.file.name.slice(0, 120) || `slip.${extFor(type)}`, contentType: type, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), storeId: a.storeId, uploadedById: actor.id },
    });
    const d = await t.cashDeposit.create({
      data: { number: `DEP-${String(n).padStart(6, "0")}`, storeId: a.storeId, bankedOn: a.bankedOn, amountCents: a.amountCents, expectedCents: expected, reference: a.reference, slipId: slip.id, note: a.note || null, createdById: actor.id },
    });
    const linked = await t.shift.updateMany({ where: { id: { in: shifts.map((s) => s.id) }, depositId: null }, data: { depositId: d.id } });
    if (linked.count !== shifts.length) throw new BankingError("Some of those cash-ups were banked a moment ago — refresh and try again");
    await queuePosting(t, "deposit", d.id);
    await audit(t, actor, "deposit.record", { storeId: a.storeId, entity: "CashDeposit", entityId: d.id, data: { number: d.number, amountCents: a.amountCents, expectedCents: expected, cashUps: shifts.length, reference: a.reference } });
    return d;
  });

  const { banking } = await getSettings();
  if (a.amountCents < expected - banking.shortToleranceCents) await raiseAlerts([shortDepositAlert(deposit, a.storeCode, shifts.length)]);
  return deposit;
}

export const shortDepositAlert = (d: { id: string; number: string; storeId: string; amountCents: number; expectedCents: number; createdById: string }, storeCode: string, cashUps: number): NewAlert => ({
  key: `DEPOSIT_SHORT:${d.id}`, rule: "DEPOSIT_SHORT", severity: "HIGH", storeId: d.storeId, userId: d.createdById, amountCents: d.expectedCents - d.amountCents,
  title: `Deposit ${d.number} short ${zar(d.expectedCents - d.amountCents)}`,
  detail: `Banked ${zar(d.amountCents)} against ${zar(d.expectedCents)} of cash from ${cashUps} cash-up${cashUps === 1 ? "" : "s"} (counted less float).`,
  evidence: [{ label: `Deposit ${d.number} and its slip`, href: `/store/${storeCode}/banking#${d.number}` }],
});

export async function reviewDeposit(id: string, storeId: string, status: "VERIFIED" | "QUERIED", note: string | null, actor: Actor & { id: string }) {
  const d = await db.cashDeposit.findFirst({ where: { id, storeId } });
  if (!d) throw new BankingError("Deposit not found");
  if (d.status === "VERIFIED") throw new BankingError(`${d.number} is verified and locked`);
  if (d.createdById === actor.id) throw new BankingError("Someone else has to check a deposit you recorded");
  if (status === "QUERIED" && !note) throw new BankingError("Say what doesn't match the bank statement");
  await tx(async (t) => {
    // From the status it was read in: two checkers at once decide once, and a verified deposit is never overwritten.
    const { count } = await t.cashDeposit.updateMany({ where: { id, storeId, status: d.status }, data: { status, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note } });
    if (!count) throw new BankingError(`${d.number} was just checked by a colleague — refresh to see what they decided`);
    await queuePosting(t, "deposit", id);
    await audit(t, actor, status === "VERIFIED" ? "deposit.verify" : "deposit.query", { storeId, entity: "CashDeposit", entityId: id, data: { number: d.number, note } });
  });
  return d;
}
