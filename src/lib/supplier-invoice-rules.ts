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

/**
 * A delivery from an HQ distribution centre is its own tax invoice (the stock order) and settles on the franchise
 * statement for the month it was received (SAST): due on that month's last day, settled once the month is over.
 */
export function statementTerms(receivedDay: string) {
  const month = receivedDay.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("en-ZA", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 15)));
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { month, dueDay: `${month}-${String(last).padStart(2, "0")}`, settledFrom: `${next}-01`, settles: `Settles on the ${label} franchise statement`, settled: `Settled on the ${label} franchise statement` };
}
