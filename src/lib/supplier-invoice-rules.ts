// Supplier invoice rules shared by the browser form and the server: the upload limit and the due-date states.
export const MAX_INVOICE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_TERMS_DAYS = 30;

export type DueState = { key: "paid" | "queried" | "overdue" | "soon" | "due"; label: string; days: number };

/** How an invoice stands against today (both YYYY-MM-DD, SAST). */
export function dueState(status: "DUE" | "PAID" | "QUERIED", dueDay: string, today: string, soonDays = 7): DueState {
  const days = Math.round((Date.parse(`${dueDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (status === "PAID") return { key: "paid", label: "Paid", days };
  if (status === "QUERIED") return { key: "queried", label: "Queried", days };
  if (days < 0) return { key: "overdue", label: `${-days} day${days === -1 ? "" : "s"} overdue`, days };
  if (days === 0) return { key: "soon", label: "Due today", days };
  if (days <= soonDays) return { key: "soon", label: `Due in ${days} day${days === 1 ? "" : "s"}`, days };
  return { key: "due", label: `Due ${dueDay}`, days };
}
