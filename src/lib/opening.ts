// Franchisee onboarding: the store-opening checklist template, seeded per store when HQ onboards it, and the
// progress maths for the HQ console. Due dates count back from the planned opening day.
export const OPENING_GROUPS = ["Legal & licences", "Set-up", "People", "Launch"] as const;
export type OpeningGroup = (typeof OPENING_GROUPS)[number];

export type OpeningTaskTemplate = {
  key: string;
  title: string;
  group: OpeningGroup;
  /** Due this many days before the opening day. */
  daysBefore: number;
  /** Only for stores that will sell licensed (THC) products. */
  thc?: boolean;
};

export const OPENING_TEMPLATE: OpeningTaskTemplate[] = [
  // Legal & licences
  { key: "lease", title: "Lease signed and premises handed over", group: "Legal & licences", daysBefore: 90 },
  { key: "cipc", title: "Business registration (CIPC) and bank account", group: "Legal & licences", daysBefore: 75 },
  { key: "vat", title: "VAT registration (or confirmed below the threshold)", group: "Legal & licences", daysBefore: 60 },
  { key: "sahpra", title: "SAHPRA / pharmacy licence for licensed products", group: "Legal & licences", daysBefore: 60, thc: true },
  { key: "popia", title: "POPIA register and information officer appointed", group: "Legal & licences", daysBefore: 30 },
  // Set-up
  { key: "fit-out", title: "Fit-out complete (signage, counter, secure storage)", group: "Set-up", daysBefore: 21 },
  { key: "internet", title: "Internet and Wi-Fi live", group: "Set-up", daysBefore: 14 },
  { key: "yoco", title: "Yoco account approved and card machines delivered", group: "Set-up", daysBefore: 10 },
  { key: "tills", title: "Tills paired with the POS", group: "Set-up", daysBefore: 7 },
  { key: "printers", title: "Receipt printers and cash drawers tested", group: "Set-up", daysBefore: 7 },
  { key: "catalogue", title: "Catalogue loaded and ranged for the store", group: "Set-up", daysBefore: 7 },
  { key: "gbp", title: "Google Business Profile claimed with hours and address", group: "Set-up", daysBefore: 7 },
  { key: "photos", title: "Store photos taken for the store finder", group: "Set-up", daysBefore: 5 },
  { key: "opening-stock", title: "Opening stock received and counted", group: "Set-up", daysBefore: 3 },
  // People
  { key: "staff", title: "Staff hired and contracts signed", group: "People", daysBefore: 21 },
  { key: "pins", title: "Staff logins and till PINs issued", group: "People", daysBefore: 5 },
  { key: "dispenser", title: "Authorised dispenser designated", group: "People", daysBefore: 5 },
  { key: "training", title: "Training done (POS, compliance, Rewards)", group: "People", daysBefore: 3 },
  // Launch
  { key: "opening-date", title: "Opening date confirmed with HQ", group: "Launch", daysBefore: 14 },
  { key: "press", title: "Press release and local listings out", group: "Launch", daysBefore: 7 },
  { key: "site-facts", title: "herbalholland.com store facts updated", group: "Launch", daysBefore: 3 },
  { key: "soft-opening", title: "Soft opening with friends and family", group: "Launch", daysBefore: 1 },
];

export type OpeningTask = { key: string; title: string; group: OpeningGroup; sortOrder: number; dueAt: Date | null };

const DAY = 86_400_000;

/** The tasks to seed for a store: every template line (licence lines only where THC is licensed), due before `openingAt`. */
export function openingTasks(opts: { openingAt: Date | null; thc: boolean }): OpeningTask[] {
  return OPENING_TEMPLATE.filter((t) => !t.thc || opts.thc).map((t, i) => ({
    key: t.key,
    title: t.title,
    group: t.group,
    sortOrder: i,
    dueAt: opts.openingAt ? new Date(opts.openingAt.getTime() - t.daysBefore * DAY) : null,
  }));
}

export type TaskState = { key?: string; group?: string; dueAt: Date | null; doneAt: Date | null };

export const isOverdue = (t: TaskState, now: Date) => !t.doneAt && !!t.dueAt && t.dueAt.getTime() < now.getTime();
export const isDueSoon = (t: TaskState, now: Date, days = 7) => !t.doneAt && !!t.dueAt && t.dueAt.getTime() >= now.getTime() && t.dueAt.getTime() < now.getTime() + days * DAY;

/** Progress for a progress bar: done / total, overdue and due-soon counts, and the next task due. */
export function checklistProgress<T extends TaskState>(tasks: T[], now: Date) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.doneAt).length;
  const overdue = tasks.filter((t) => isOverdue(t, now)).length;
  const dueSoon = tasks.filter((t) => isDueSoon(t, now)).length;
  const next = tasks.filter((t) => !t.doneAt && t.dueAt).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0] ?? null;
  return { total, done, pct: total ? done / total : 0, overdue, dueSoon, next, complete: total > 0 && done === total };
}

/** Tasks grouped in template order, each group with its own progress. */
export function groupTasks<T extends TaskState & { group: string; sortOrder?: number }>(tasks: T[], now: Date) {
  return OPENING_GROUPS.map((group) => {
    const list = tasks.filter((t) => t.group === group).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return { group, tasks: list, ...checklistProgress(list, now) };
  }).filter((g) => g.tasks.length);
}
