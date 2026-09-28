import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, CircleCheck, CircleSlash, FileText, RotateCcw, Search, Store as StoreIcon } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { visibleAlerts } from "@/server/loss";
import { hrefWith, sp1 } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Detail } from "@/components/ui/misc";
import { Field, Textarea } from "@/components/ui/form";
import { BackLink } from "@/components/store/ui";
import { ConfirmAction, FieldError } from "@/components/store/action-form";
import { Flash } from "@/components/hq/flash";
import { AlertStatusBadge, SeverityBadge } from "@/components/loss/badges";
import { ALERT_STATUS, ROLE_LABEL } from "@/components/loss/labels";
import { explainRule, ruleLabel } from "@/components/loss/rules";
import { ALERT_ROLES, NEXT_STATUS, canActOnAlerts } from "../access";
import { updateAlert } from "./actions";
import type { AlertStatus } from "@/generated/prisma/client";

export const metadata = { title: "Loss-prevention alert" };

export default async function AlertPage({ params, searchParams }: { params: Promise<{ code: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code, id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(ALERT_ROLES);
  const store = await storeForUser(user, code);
  // Only an alert this person may see at this store — never one about themselves, whatever the URL says.
  const alert = await db.alert.findFirst({ where: { AND: [{ id }, visibleAlerts(user, [store.id])] } });
  if (!alert) notFound();
  const path = `/store/${store.code}/loss-prevention`;
  const [people, history, settings] = await Promise.all([
    db.user.findMany({ where: { id: { in: [alert.userId, alert.closedById].filter((x): x is string => !!x) } }, select: { id: true, name: true, role: true, active: true } }),
    db.auditLog.findMany({ where: { storeId: store.id, action: "alert.update", entityId: alert.id }, orderBy: { at: "desc" }, take: 20, select: { id: true, at: true, actorName: true, data: true } }),
    getSettings(),
  ]);
  const who = new Map(people.map((p) => [p.id, p]));
  const subject = alert.userId ? who.get(alert.userId) : null;
  const closer = alert.closedById ? who.get(alert.closedById) : null;
  const evidence = readEvidence(alert.evidence);
  const next = NEXT_STATUS[alert.status];
  const act = (to: AlertStatus) => updateAlert.bind(null, store.code, alert.id, to);
  const open = alert.status === "OPEN" || alert.status === "INVESTIGATING";

  return (
    <>
      <Flash message={sp1(sp.m) || undefined} />
      <BackLink href={path}>Loss prevention</BackLink>
      <PageHeader
        overline={`${ruleLabel(alert.rule)} · ${store.name}`}
        title={alert.title}
        description={explainRule(alert.rule, settings)}
        actions={
          <>
            <SeverityBadge severity={alert.severity} />
            <AlertStatusBadge status={alert.status} />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="What was found" description={`Raised ${fmtDateTime(alert.createdAt)} by the automatic checks`} />
            <CardBody>
              <p className="text-sm leading-relaxed text-ink-800">{alert.detail}</p>
              <h3 className="eyebrow mt-6 mb-2 text-brand-700">Evidence</h3>
              {evidence.length ? (
                <ul className="divide-y divide-ink-100 rounded-xl border border-ink-150">
                  {evidence.map((e, i) => (
                    <li key={i}>
                      {e.href ? (
                        <Link href={e.href} className="flex min-h-11 items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink-850 hover:bg-brand-50/50 hover:text-brand-700">
                          <FileText className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.9} aria-hidden />
                          <span className="min-w-0 flex-1">{e.label}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                        </Link>
                      ) : (
                        <div className="flex min-h-11 items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700">
                          <FileText className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.9} aria-hidden />
                          {e.label}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-500">No evidence was attached.</p>
              )}
            </CardBody>
          </Card>

          {canActOnAlerts(user) && (
            <Card>
              <CardHeader
                title={open ? "Work this alert" : "Closed"}
                description={
                  open
                    ? "Check the evidence, and talk to the person before deciding. Your note stays with the alert and in the audit log."
                    : "Reopen it if something new comes to light."
                }
              />
              <CardBody className="flex flex-wrap items-start gap-2">
                {next.includes("INVESTIGATING") && (
                  <ConfirmAction action={act("INVESTIGATING")} label="Investigating" icon={<Search className="h-4 w-4" aria-hidden />} size="md" title="Mark as investigating" confirmLabel="Mark as investigating" variant="dark">
                    <NoteField id="note-investigating" label="Note (optional)" placeholder="What you're checking, and who's looking into it" />
                  </ConfirmAction>
                )}
                {next.includes("RESOLVED") && (
                  <ConfirmAction action={act("RESOLVED")} label="Resolve" icon={<CircleCheck className="h-4 w-4" aria-hidden />} size="md" title="Resolve this alert" confirmLabel="Resolve" variant="primary">
                    <NoteField id="note-resolve" label="How was it resolved?" required placeholder="e.g. Recounted with the manager — R200 was in the safe bag" />
                  </ConfirmAction>
                )}
                {next.includes("DISMISSED") && (
                  <ConfirmAction action={act("DISMISSED")} label="Dismiss — false alarm" icon={<CircleSlash className="h-4 w-4" aria-hidden />} size="md" title="Dismiss as a false alarm" confirmLabel="Dismiss" variant="dark">
                    <NoteField id="note-dismiss" label="Why is it a false alarm?" required placeholder="e.g. Trading hours were extended for the public holiday" />
                  </ConfirmAction>
                )}
                {next.includes("OPEN") && (
                  <ConfirmAction action={act("OPEN")} label="Reopen" icon={<RotateCcw className="h-4 w-4" aria-hidden />} size="md" title="Reopen this alert" confirmLabel="Reopen" variant="dark">
                    <NoteField id="note-reopen" label="Why reopen it? (optional)" placeholder="What's come to light" />
                  </ConfirmAction>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="History" description="Every change is in the audit log" />
            <ol className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {history.map((h) => {
                const d = readChange(h.data);
                return (
                  <li key={h.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-ink-850">
                        <span className="font-medium">{h.actorName ?? "Someone"}</span>{" "}
                        {d ? (
                          <>
                            moved it from {ALERT_STATUS[d.from].label.toLowerCase()} to <span className="font-medium">{ALERT_STATUS[d.to].label.toLowerCase()}</span>
                          </>
                        ) : (
                          "updated it"
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-ink-500">{fmtDateTime(h.at)}</span>
                    </div>
                    {d?.note && <p className="mt-1 whitespace-pre-line text-ink-600">“{d.note}”</p>}
                  </li>
                );
              })}
              <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="text-ink-850">Raised by the automatic checks</span>
                <span className="shrink-0 text-xs text-ink-500">{fmtDateTime(alert.createdAt)}</span>
              </li>
            </ol>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Details" />
          <CardBody className="pt-2">
            <dl className="divide-y divide-ink-100">
              <Detail label="Severity">
                <SeverityBadge severity={alert.severity} />
              </Detail>
              <Detail label="Status">
                <AlertStatusBadge status={alert.status} />
              </Detail>
              <Detail label="Rule">{ruleLabel(alert.rule)}</Detail>
              <Detail label="About">
                {alert.userId ? (
                  <>
                    <Link href={hrefWith(path, {}, { person: alert.userId })} className="text-brand-700 hover:underline">
                      {subject?.name ?? "Former staff member"}
                    </Link>
                    {subject && <span className="block text-xs font-normal text-ink-500">{ROLE_LABEL[subject.role] ?? subject.role}{subject.active ? "" : " · no longer active"}</span>}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <StoreIcon className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.9} aria-hidden />
                    The store, not one person
                  </span>
                )}
              </Detail>
              <Detail label="At risk">{alert.amountCents != null ? zar(alert.amountCents) : "—"}</Detail>
              <Detail label="Raised">{fmtDateTime(alert.createdAt)}</Detail>
              <Detail label="Last updated">{fmtDateTime(alert.updatedAt)}</Detail>
              {alert.notifiedAt && <Detail label="Owner & area manager told">{fmtDateTime(alert.notifiedAt)}</Detail>}
              {alert.closedAt && (
                <Detail label={alert.status === "DISMISSED" ? "Dismissed by" : "Resolved by"}>
                  {closer?.name ?? "—"}
                  <span className="block text-xs font-normal text-ink-500">{fmtDateTime(alert.closedAt)}</span>
                </Detail>
              )}
            </dl>
            {alert.note && (
              <div className="mt-4 rounded-xl bg-ink-50 p-3">
                <div className="eyebrow mb-1 text-brand-700">Latest note</div>
                <p className="whitespace-pre-line text-sm text-ink-800">{alert.note}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function NoteField({ id, label, required, placeholder }: { id: string; label: string; required?: boolean; placeholder: string }) {
  return (
    <Field label={label} htmlFor={id}>
      <Textarea id={id} name="note" required={required} minLength={required ? 3 : undefined} maxLength={1000} rows={3} placeholder={placeholder} />
      <FieldError name="note" />
    </Field>
  );
}

/** Evidence is JSON written by the rules: [{ label, href? }]. Only in-app links become links. */
function readEvidence(json: unknown) {
  return (Array.isArray(json) ? json : []).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const { label, href } = e as { label?: unknown; href?: unknown };
    if (typeof label !== "string" || !label) return [];
    return [{ label, href: typeof href === "string" && href.startsWith("/") && !href.startsWith("//") ? href : null }];
  });
}

function readChange(json: unknown): { from: AlertStatus; to: AlertStatus; note: string | null } | null {
  const d = (json ?? {}) as { from?: unknown; to?: unknown; note?: unknown };
  const ok = (s: unknown): s is AlertStatus => typeof s === "string" && Object.hasOwn(ALERT_STATUS, s);
  return ok(d.from) && ok(d.to) ? { from: d.from, to: d.to, note: typeof d.note === "string" && d.note ? d.note : null } : null;
}
