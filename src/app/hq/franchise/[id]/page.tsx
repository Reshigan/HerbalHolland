import { notFound } from "next/navigation";
import { CalendarClock, Lock, Mail, Phone, Trash2 } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { LEAD_ROLES } from "@/server/leads";
import {
  CAPITAL_LABEL,
  DISCLOSURE_DAYS,
  LEAD_LIMITS,
  LEAD_MOVES,
  LEAD_STATUS,
  LEAD_STATUSES,
  capitalLabel,
  earliestSigning,
  isLeadStatus,
  purgeOn,
  signingBlock,
  type LeadStatusKey,
} from "@/lib/leads";
import { PROVINCES, displayPhone, type ProvinceCode } from "@/lib/sa";
import { dayKey, fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Detail } from "@/components/ui/misc";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/form";
import { ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { LeadStatusBadge } from "../ui";
import { assignOwner, moveLead, removeLead, saveDisclosure, saveNotes } from "./actions";

export const metadata = { title: "Franchise lead" };

// The usual next step is the main action; skipping ahead, going back or closing are secondary.
const NEXT: Partial<Record<LeadStatusKey, LeadStatusKey>> = {
  NEW: "CONTACTED",
  CONTACTED: "INFO_EVENING",
  INFO_EVENING: "DISCLOSURE_SENT",
  DISCLOSURE_SENT: "SIGNED",
  NOT_A_FIT: "CONTACTED",
};
const PROMPT: Record<LeadStatusKey, string> = {
  NEW: "",
  CONTACTED: "e.g. Called; keen on Ballito, wants to bring a partner in",
  INFO_EVENING: "e.g. Booked for the Durban evening on 30 Sep",
  DISCLOSURE_SENT: "e.g. Emailed with the draft agreement",
  SIGNED: "e.g. Signed at HQ with their attorney present",
  NOT_A_FIT: "e.g. Capital is too far off for now; open to hearing again next year",
};
const province = (p: string | null) => (p && Object.hasOwn(PROVINCES, p) ? PROVINCES[p as ProvinceCode] : null);
/** A step back along the pipeline (correcting a slip), as opposed to moving on. */
const back = (from: LeadStatusKey, to: LeadStatusKey) => to !== "NOT_A_FIT" && from !== "NOT_A_FIT" && LEAD_STATUSES.indexOf(to) < LEAD_STATUSES.indexOf(from);

export default async function FranchiseLeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(LEAD_ROLES);
  const lead = await db.franchiseLead.findUnique({ where: { id } });
  if (!lead) notFound();
  const [team, history] = await Promise.all([
    db.user.findMany({
      where: { OR: [{ role: { in: LEAD_ROLES }, active: true }, ...(lead.ownerId ? [{ id: lead.ownerId }] : [])] },
      select: { id: true, name: true, role: true, active: true },
      orderBy: { name: "asc" },
    }),
    db.auditLog.findMany({ where: { action: { in: ["lead.create", "lead.update"] }, entityId: lead.id }, orderBy: { at: "desc" }, take: 30, select: { id: true, at: true, action: true, actorName: true, data: true } }),
  ]);
  const now = new Date();
  const admin = can(user, "admin");
  const owner = team.find((u) => u.id === lead.ownerId);
  const sent = lead.disclosureSentAt;
  const earliest = sent ? earliestSigning(sent) : null;
  const block = signingBlock(sent, now);
  const moves = LEAD_MOVES[lead.status];
  const today = dayKey(now);

  return (
    <>
      <BackLink href="/hq/franchise">Franchise leads</BackLink>
      <Flash message={sp.m} />
      <PageHeader
        overline={`${lead.number} · received ${fmtDateTime(lead.createdAt)}`}
        title={lead.name}
        description={`${lead.area}${province(lead.province) ? `, ${province(lead.province)}` : ""} · ${CAPITAL_LABEL.toLowerCase()}: ${capitalLabel(lead.capital)}`}
        actions={<LeadStatusBadge status={lead.status} className="text-xs" />}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="The enquiry" description="As they sent it from herbalholland.com/franchise" />
            <CardBody className="pt-3">
              <div className="flex flex-wrap gap-2">
                <a href={`mailto:${lead.email}?subject=${encodeURIComponent(`Your franchise enquiry ${lead.number}`)}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink-200 bg-white px-4 text-sm font-medium text-ink-850 hover:border-ink-300 hover:bg-ink-50">
                  <Mail className="h-4 w-4 text-ink-500" strokeWidth={1.9} aria-hidden />
                  <span className="[overflow-wrap:anywhere]">{lead.email}</span>
                </a>
                <a href={`tel:${lead.phone}`} className="tnum inline-flex min-h-10 items-center gap-2 rounded-full border border-ink-200 bg-white px-4 text-sm font-medium text-ink-850 hover:border-ink-300 hover:bg-ink-50">
                  <Phone className="h-4 w-4 text-ink-500" strokeWidth={1.9} aria-hidden />
                  {displayPhone(lead.phone)}
                </a>
              </div>
              <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
                <Detail label="Where they'd open">{lead.area}</Detail>
                <Detail label="Province">{province(lead.province) ?? "—"}</Detail>
                <Detail label={CAPITAL_LABEL}>{capitalLabel(lead.capital)}</Detail>
                <Detail label="Pharmacist partner">{lead.pharmacist ? "Yes" : "No"}</Detail>
                <Detail label="Came from">{lead.source ? <span className="font-mono text-xs">{lead.source}</span> : "The franchise page"}</Detail>
                <Detail label="Last change">{timeAgo(lead.updatedAt, now)}</Detail>
              </dl>
              <h3 className="eyebrow mb-1.5 mt-5 text-brand-700">Retail or business experience</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-800">{lead.experience}</p>
              {lead.message && (
                <>
                  <h3 className="eyebrow mb-1.5 mt-5 text-brand-700">Anything else</h3>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink-800">{lead.message}</p>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Move it on" description={`Now: ${LEAD_STATUS[lead.status].label}. ${LEAD_STATUS[lead.status].hint}.`} />
            <CardBody className="flex flex-wrap items-start gap-2">
              {moves.map((to) => {
                if (to === "SIGNED" && block)
                  return (
                    <div key={to} className="flex w-full items-start gap-2.5 rounded-xl border border-ink-150 bg-ink-50 px-4 py-3 text-sm text-ink-600" role="note">
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.9} aria-hidden />
                      <span>
                        <span className="font-medium text-ink-800">Signed</span> isn&apos;t available yet. {block}
                      </span>
                    </div>
                  );
                const main = NEXT[lead.status] === to;
                return (
                  <ConfirmAction
                    key={to}
                    action={moveLead.bind(null, lead.id, lead.status, to)}
                    label={to === "NOT_A_FIT" ? "Not a fit" : lead.status === "NOT_A_FIT" ? "Reopen" : back(lead.status, to) ? `Back to ${LEAD_STATUS[to].label}` : LEAD_STATUS[to].label}
                    triggerVariant={main ? "dark" : "outline"}
                    size="md"
                    title={`Move ${lead.number} to “${LEAD_STATUS[to].label}”`}
                    confirmLabel={`Move to ${LEAD_STATUS[to].label}`}
                    variant={main ? "primary" : "dark"}
                  >
                    {to === "SIGNED" && sent && (
                      <p>
                        The disclosure document went out on {fmtDate(sent)}; signing is allowed from {fmtDate(earliest!)}.
                      </p>
                    )}
                    {to === "DISCLOSURE_SENT" && (
                      <div>
                        <Label htmlFor={`sent-on-${to}`}>Disclosure document sent on</Label>
                        <Input id={`sent-on-${to}`} name="sentOn" type="date" max={today} defaultValue={sent ? dayKey(sent) : today} required className="max-w-[12rem]" />
                        <FieldError name="sentOn" />
                        <p className="mt-1.5 text-xs text-ink-500">Signing can follow {DISCLOSURE_DAYS} days later (CPA franchise regulations).</p>
                      </div>
                    )}
                    {to === "NOT_A_FIT" && <p className="text-xs text-ink-500">Not-a-fit enquiries are deleted a year after their last change, unless someone reopens them.</p>}
                    <Field label="Note (optional, added to the notes)" htmlFor={`note-${to}`}>
                      <Textarea id={`note-${to}`} name="note" rows={3} maxLength={LEAD_LIMITS.note} placeholder={PROMPT[to]} />
                      <FieldError name="note" />
                    </Field>
                  </ConfirmAction>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notes" description="For the team: calls, meetings, what they're weighing up. Only HQ sees them, and they go when the enquiry is deleted." />
            <CardBody>
              <ActionForm action={saveNotes.bind(null, lead.id)}>
                <input type="hidden" name="v" value={lead.updatedAt.toISOString()} />
                <Label htmlFor="lead-notes" className="sr-only">
                  Notes
                </Label>
                <Textarea id="lead-notes" name="notes" rows={8} maxLength={LEAD_LIMITS.notes} defaultValue={lead.notes ?? ""} placeholder="Nothing yet. A note added with a status change lands here, dated." className="leading-relaxed" />
                <FieldError name="notes" />
                <div className="mt-3 flex justify-end">
                  <SubmitButton variant="outline" pendingLabel="Saving…">
                    Save notes
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>

        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Owner" description="Who in HQ is following it up" />
            <CardBody>
              <ActionForm action={assignOwner.bind(null, lead.id)}>
                <Label htmlFor="lead-owner">Owner</Label>
                <div className="flex flex-wrap gap-2">
                  <Select id="lead-owner" name="ownerId" defaultValue={lead.ownerId ?? ""} wrapperClassName="min-w-0 flex-1 basis-48">
                    <option value="">Unassigned</option>
                    {team.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.id === user.id ? " (you)" : ""}
                        {!u.active ? " (no longer active)" : ""}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton variant="outline" pendingLabel="Saving…">
                    Assign
                  </SubmitButton>
                </div>
                <FieldError name="ownerId" />
                {!owner && lead.status === "NEW" && <p className="mt-2 text-xs text-ink-500">Nobody has picked this one up yet.</p>}
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Disclosure document" description={`The CPA's franchise regulations: at least ${DISCLOSURE_DAYS} days between the disclosure document and signing.`} />
            <CardBody className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-ink-50 p-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" strokeWidth={1.9} aria-hidden />
                <div className="text-sm">
                  {sent && earliest ? (
                    <>
                      <div className="text-ink-600">
                        Sent on <span className="font-medium text-ink-900">{fmtDate(sent)}</span>
                      </div>
                      <div className="text-ink-600">
                        Earliest signing: <span className="font-semibold text-ink-950">{fmtDate(earliest)}</span>
                        {lead.status !== "SIGNED" && <span className="text-ink-500">{block ? ` (${daysUntil(earliest, now)})` : " (from today it can be signed)"}</span>}
                      </div>
                    </>
                  ) : (
                    <span className="text-ink-600">Not sent yet. Record the day it goes out: signing can follow {DISCLOSURE_DAYS} days later.</span>
                  )}
                </div>
              </div>
              {lead.status === "SIGNED" ? (
                <ViewOnly>The agreement is signed: the disclosure date is part of the record and can&apos;t change.</ViewOnly>
              ) : (
                <ActionForm action={saveDisclosure.bind(null, lead.id)}>
                  <Label htmlFor="lead-sent-on">Sent on</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input id="lead-sent-on" name="sentOn" type="date" max={today} defaultValue={sent ? dayKey(sent) : ""} className="w-auto min-w-0 flex-1 basis-40" />
                    <SubmitButton variant="outline" pendingLabel="Saving…">
                      Save date
                    </SubmitButton>
                  </div>
                  <FieldError name="sentOn" />
                  <p className="mt-2 text-xs text-ink-500">Moving the lead to “Disclosure sent” records it too.</p>
                </ActionForm>
              )}
            </CardBody>
          </Card>

          {lead.status === "NOT_A_FIT" && (
            <Notice tone="info" title="Deleted automatically">
              On {fmtDate(purgeOn(lead.updatedAt))}, a year after its last change (POPIA), unless someone reopens it.
            </Notice>
          )}

          <Card>
            <CardHeader title="History" description="Every change, from the audit log" />
            <ol className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <span className="text-ink-850">
                    {h.action === "lead.create" ? (
                      <>Enquiry received on herbalholland.com</>
                    ) : (
                      <>
                        <span className="font-medium">{h.actorName ?? "Someone"}</span> {describe(h.data)}
                      </>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-ink-500">{fmtDateTime(h.at)}</span>
                </li>
              ))}
            </ol>
          </Card>

          {admin ? (
            <Card className="border-rose-500/20">
              <CardHeader title="Delete this enquiry" description="POPIA: for a request from the person to delete their information" />
              <CardBody>
                <ConfirmAction
                  action={removeLead.bind(null, lead.id)}
                  label="Delete enquiry"
                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                  title={`Delete ${lead.number} for good?`}
                  confirmLabel="Delete for good"
                  typeToConfirm="DELETE"
                  className="w-full"
                >
                  <p>This can&apos;t be undone. Their details, what they wrote and the notes are deleted, and the two emails about it are blanked in the message log. The audit log keeps only the number.</p>
                </ConfirmAction>
              </CardBody>
            </Card>
          ) : (
            <ViewOnly>Deleting an enquiry at the person&apos;s request (POPIA) is done by the HQ administrator.</ViewOnly>
          )}
        </div>
      </div>
    </>
  );
}

function daysUntil(d: Date, now: Date) {
  const n = Math.round((Date.parse(`${dayKey(d)}T00:00:00Z`) - Date.parse(`${dayKey(now)}T00:00:00Z`)) / 86_400_000);
  return n === 1 ? "tomorrow" : `in ${n} days`;
}

/** An audit entry's changes in words: "moved it from New to Contacted with a note and assigned it to Pieter de Vries". */
function describe(json: unknown) {
  const d = (json ?? {}) as Record<string, unknown>;
  const pair = (v: unknown) => (v && typeof v === "object" ? (v as { from?: unknown; to?: unknown }) : null);
  const label = (s: unknown) => (isLeadStatus(s) ? LEAD_STATUS[s].label : "?");
  const date = (s: unknown) => (typeof s === "string" ? fmtDate(`${s}T12:00:00+02:00`) : null);
  const parts: string[] = [];
  const status = pair(d.status);
  if (status) parts.push(`moved it from ${label(status.from)} to ${label(status.to)}${d.note ? " with a note" : ""}`);
  const owner = pair(d.owner);
  if (owner) parts.push(typeof owner.to === "string" ? `assigned it to ${owner.to}` : "unassigned it");
  const sent = pair(d.disclosureSentAt);
  if (sent) parts.push(date(sent.to) ? `${date(sent.from) ? `changed the disclosure date from ${date(sent.from)} to` : "set the disclosure date to"} ${date(sent.to)}` : "cleared the disclosure date");
  if (d.notes) parts.push("edited the notes");
  if (!parts.length) return "updated it";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
