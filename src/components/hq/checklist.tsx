// The store-opening checklist card on the HQ store page: a progress bar, tasks grouped as in the template with
// due dates (overdue in red, with the word), "mark done" with a note, and undo. Server component; the buttons are
// the action-form client pieces.
import { CheckCircle2, Circle, ClipboardList } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Meter } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/page";
import { ActionButton, ConfirmAction } from "@/components/ui/action-form";
import { isDueSoon, isOverdue } from "@/lib/opening";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { checklist } from "@/server/store-tasks";
import type { ActionState } from "@/server/hq/guard";

type Data = Awaited<ReturnType<typeof checklist>>;
type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

export function OpeningChecklist({ data, now, canEdit, storeName, onDone, onReopen, onStart }: {
  data: Data;
  now: Date;
  canEdit: boolean;
  storeName: string;
  onDone: (taskId: string) => Action;
  onReopen: (taskId: string) => Action;
  onStart: Action;
}) {
  const { progress: p } = data;
  if (!data.tasks.length)
    return (
      <Card data-testid="opening-checklist">
        <CardHeader title="Opening checklist" description="Legal, set-up, people and launch tasks for a new store" />
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No checklist yet" className="py-8" action={canEdit && <ActionButton action={onStart} variant="primary" size="md">Start the opening checklist</ActionButton>}>
          {canEdit ? `Seeds the template for ${storeName}, with due dates counted back from its opening day.` : "The HQ team starts it when the store is onboarded."}
        </EmptyState>
      </Card>
    );
  return (
    <Card data-testid="opening-checklist">
      <CardHeader
        title="Opening checklist"
        description={p.complete ? "Everything is done. Ready to open." : `${p.done} of ${p.total} done${p.overdue ? ` · ${p.overdue} overdue` : ""}${p.dueSoon ? ` · ${p.dueSoon} due this week` : ""}`}
        action={<span className={cn("tnum font-display text-lg font-semibold", p.complete ? "text-leaf-700" : "text-ink-900")}>{Math.round(p.pct * 100)}%</span>}
      />
      <CardBody className="space-y-5 pt-3">
        <Meter value={p.done} max={p.total} tone={p.complete ? "green" : p.overdue ? "red" : "orange"} />
        {data.groups.map((g) => (
          <section key={g.group} aria-label={g.group}>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="eyebrow text-brand-700">{g.group}</h3>
              <span className="tnum text-xs text-ink-500">
                {g.done}/{g.total}
              </span>
            </div>
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-150">
              {g.tasks.map((t) => {
                const late = isOverdue(t, now);
                const soon = isDueSoon(t, now);
                return (
                  <li key={t.id} className={cn("flex items-start gap-3 px-3 py-2.5", late && "bg-rose-50/60")}>
                    <span className={cn("mt-0.5 shrink-0", t.doneAt ? "text-leaf-600" : late ? "text-rose-600" : "text-ink-500")} aria-hidden>
                      {t.doneAt ? <CheckCircle2 className="h-5 w-5" strokeWidth={1.9} /> : <Circle className="h-5 w-5" strokeWidth={1.9} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm font-medium", t.doneAt ? "text-ink-500 line-through decoration-ink-300" : "text-ink-900")}>{t.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                        {t.doneAt ? (
                          <span>
                            Done {fmtDate(t.doneAt)}
                            {t.doneBy ? ` by ${t.doneBy}` : ""}
                            {t.note ? ` · ${t.note}` : ""}
                          </span>
                        ) : (
                          <>
                            {t.dueAt ? <span className={cn(late && "font-semibold text-rose-600", soon && "font-semibold text-amber-700")}>Due {fmtDate(t.dueAt)}</span> : <span>No due date</span>}
                            {late && <Badge tone="red">Overdue</Badge>}
                            {soon && <Badge tone="amber">Due soon</Badge>}
                          </>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="shrink-0">
                        {t.doneAt ? (
                          <ActionButton action={onReopen(t.id)} variant="ghost" size="sm">
                            Undo
                          </ActionButton>
                        ) : (
                          <ConfirmAction action={onDone(t.id)} label="Mark done" title={t.title} confirmLabel="Mark done" variant="primary">
                            <Field label="Note (optional)" htmlFor={`note-${t.id}`}>
                              <Input id={`note-${t.id}`} name="note" maxLength={300} placeholder="Reference, who did it, where the paperwork is" />
                            </Field>
                          </ConfirmAction>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </CardBody>
    </Card>
  );
}

/** One-line progress for the HQ stores list. */
export function ChecklistLine({ progress }: { progress: { total: number; done: number; overdue: number } | undefined }) {
  if (!progress?.total) return null;
  const complete = progress.done === progress.total;
  const [track, fill] = complete ? ["bg-leaf-100", "bg-leaf-500"] : progress.overdue ? ["bg-rose-100", "bg-rose-500"] : ["bg-brand-100", "bg-brand-500"];
  return (
    <span className="mt-1 flex items-center gap-2 text-xs" title={`Opening checklist: ${progress.done} of ${progress.total} done`}>
      <span className={cn("h-1.5 w-16 shrink-0 overflow-hidden rounded-full", track)} role="meter" aria-label="Opening checklist progress" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total}>
        <span className={cn("block h-full rounded-full", fill)} style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
      </span>
      <span className={cn("tnum whitespace-nowrap", complete ? "text-leaf-700" : progress.overdue ? "font-semibold text-rose-600" : "text-ink-500")}>
        {progress.done}/{progress.total}
        {progress.overdue ? ` · ${progress.overdue} overdue` : ""}
      </span>
    </span>
  );
}
