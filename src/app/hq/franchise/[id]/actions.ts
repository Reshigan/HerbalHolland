"use server";
// Working a franchise lead: HQ admin and the HQ team (guard "network"); deleting one is for the HQ admin (POPIA
// requests). Every change goes through @/server/leads, which checks the rules and writes the audit log.
import { revalidatePath } from "next/cache";
import { guard, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { str, parseDay } from "@/server/hq/form";
import { LeadError, deleteLead, updateLead, type LeadPatch } from "@/server/leads";
import { LEAD_STATUS, earliestSigning, isLeadStatus, type LeadStatusKey } from "@/lib/leads";
import { fmtDate } from "@/lib/format";

type Result = { ok: true; lead: Awaited<ReturnType<typeof updateLead>>["lead"]; changed: string[] } | { ok: false; state: ActionState };

async function apply(id: string, patch: LeadPatch): Promise<Result> {
  const g = await guard("network");
  if (!g) return { ok: false, state: DENIED };
  try {
    const r = await updateLead(id, patch, g.actor);
    revalidatePath("/hq/franchise");
    revalidatePath(`/hq/franchise/${id}`);
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof LeadError) return { ok: false, state: fail(e.message, e.field ? { [e.field]: e.message } : undefined) };
    throw e;
  }
}

/** Moves a lead on (bound: the status it had when the page was shown, and where it's going), with an optional note. */
export async function moveLead(id: string, from: LeadStatusKey, to: LeadStatusKey, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!isLeadStatus(from) || !isLeadStatus(to)) return fail("That isn't a status a lead can have.");
  const patch: LeadPatch = { status: to, expectStatus: from, note: str(fd, "note") };
  if (to === "DISCLOSURE_SENT") {
    const sentOn = parseDay(str(fd, "sentOn"));
    if (!sentOn) return fail("Add the day the disclosure document was sent.", { sentOn: "Choose a date" });
    patch.disclosureSentAt = sentOn;
  }
  const r = await apply(id, patch);
  if (!r.ok) return r.state;
  const signing = to === "DISCLOSURE_SENT" && r.lead.disclosureSentAt ? ` The earliest signing day is ${fmtDate(earliestSigning(r.lead.disclosureSentAt))}.` : "";
  flashTo(`/hq/franchise/${id}`, `Moved to “${LEAD_STATUS[to].label}”${r.changed.includes("note") ? " and your note is in the notes" : ""}.${signing}`);
}

export async function assignOwner(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await apply(id, { ownerId: str(fd, "ownerId") || null });
  if (!r.ok) return r.state;
  if (!r.changed.length) return done("No change: it was already assigned that way.");
  return done(r.lead.ownerId ? "Assigned. It's in their hands now." : "Unassigned.");
}

export async function saveNotes(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const seen = new Date(str(fd, "v"));
  const r = await apply(id, { notes: str(fd, "notes"), expectUpdatedAt: Number.isNaN(seen.getTime()) ? undefined : seen });
  if (!r.ok) return r.state;
  return done(r.changed.length ? "Notes saved." : "No changes to save.");
}

export async function saveDisclosure(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const raw = str(fd, "sentOn");
  const sentOn = raw ? parseDay(raw) : null;
  if (raw && !sentOn) return fail("Choose a date.", { sentOn: "Choose a date" });
  const r = await apply(id, { disclosureSentAt: sentOn });
  if (!r.ok) return r.state;
  if (!r.changed.length) return done("No change to save.");
  const d = r.lead.disclosureSentAt;
  return done(d ? `Saved: sent on ${fmtDate(d)}, so the earliest signing day is ${fmtDate(earliestSigning(d))}.` : "Disclosure date cleared.");
}

/** POPIA request: the lead and its emails in the message log are erased; the audit log keeps the number only. */
export async function removeLead(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  if (str(fd, "confirm").toUpperCase() !== "DELETE") return fail("Type DELETE to confirm.");
  let number: string;
  try {
    number = await deleteLead(id, g.actor);
  } catch (e) {
    if (e instanceof LeadError) return fail(e.message);
    throw e;
  }
  revalidatePath("/hq/franchise");
  flashTo("/hq/franchise?status=all", `${number} is deleted: the enquiry, its notes and its emails in the message log. The audit log keeps only the number.`);
}
