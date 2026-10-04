// Audit log entries in plain English: "trade.account.hold" + its data → "Trade account put on hold" and
// "Reason: overdue 60 days · Limit: R50,000.00". Pure, so it's unit-tested (tests/audit-describe.test.ts).
import { bps, zar } from "./money";

const VERBS: Record<string, string> = {
  create: "created", update: "updated", delete: "deleted", cancel: "cancelled", approve: "approved", reject: "rejected",
  refund: "refunded", email: "emailed", email_all: "emailed to every store", hold: "put on hold", release: "released",
  adjust: "adjusted", writeoff: "written off", override: "overridden", export: "exported", signin: "signed in",
  signout: "signed out", start: "started", open: "opened", close: "closed", issue: "issued", redeem: "redeemed",
  pay: "paid", paid: "paid", reopen: "reopened", query: "queried", assign: "assigned", reply: "replied to", resolve: "resolved",
  receive: "received", add: "added", remove: "removed", verify: "verified", submit: "submitted", send: "sent", end: "ended",
  post: "posted", enable: "enabled", disable: "disabled", status: "status changed", price: "price changed", fees: "fees changed",
  settings: "settings changed", purge: "purged", priority: "priority changed", unpair: "unpaired", pair: "paired",
  password_reset: "password reset", pin_reset: "PIN reset", schedule: "scheduled", unschedule: "schedule stopped",
  discrepancy: "discrepancy reported", file_view: "file viewed", register_export: "register exported", seed: "seeded",
  task_done: "task done", task_reopen: "task reopened", checklist_seed: "checklist added", book_collection: "collection booked",
  authorisation_add: "authorisation added", authorisation_revoke: "authorisation revoked", member_link: "linked to a member",
  door_list: "door list printed", dispenser: "dispenser rights changed", tender_variance: "paid amount differed from the total",
  offline_price: "sold at an offline price", points_overdraw: "redeemed more points than the balance",
};

const NOUNS: Record<string, string> = {
  stockorder: "stock order", stocktake: "stock take", pricelist: "price list", supplier_invoice: "supplier invoice",
  staff_push: "staff notifications", pos: "till", auth: "sign-in", lead: "franchise lead", trade: "trade", sale: "sale",
};

const words = (s: string) => NOUNS[s] ?? s.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "trade.account.hold" → "Trade account put on hold"; unknown verbs read as words ("trade.order" → "Trade order"). */
export function describeAction(action: string) {
  const parts = action.split(".").filter(Boolean);
  if (!parts.length) return action;
  if (parts[0] === "settings" && parts.length > 1) return cap(`${parts.slice(1).map(words).join(" ")} settings changed`);
  const last = parts[parts.length - 1];
  const verb = parts.length > 1 ? VERBS[last] : undefined;
  const subject = (verb ? parts.slice(0, -1) : parts).map(words).join(" ");
  return cap(verb ? `${subject} ${verb}` : subject);
}

// Amounts stored in cents under plain names (older entries): formatted as rand.
const MONEY = new Set(["amount", "total", "paid", "charged", "price", "cost", "credit", "limit", "deposit", "variance", "creditLimit", "balance"]);
const POINTS = new Set(["redeemed", "points"]);

function value(key: string, v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") {
    if (/cents$/i.test(key) || (MONEY.has(key) && Number.isInteger(v))) return zar(v);
    if (/bps$/i.test(key)) return bps(v);
    return POINTS.has(key) ? `${v.toLocaleString("en-US")} pts` : v.toLocaleString("en-US");
  }
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  if (Array.isArray(v)) {
    const flat = v.filter((x) => ["string", "number"].includes(typeof x)).map(String);
    if (!flat.length) return v.length ? `${v.length} item${v.length === 1 ? "" : "s"}` : null;
    return flat.slice(0, 3).join(", ") + (flat.length > 3 ? ` +${flat.length - 3}` : "");
  }
  return null; // nested objects stay in the raw view
}

/** Up to `max` readable "Label: value" pairs from an entry's data (ids and nested objects left to the raw view). */
export function describeData(data: unknown, max = 4): string {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return "";
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (/(^id$|Id$|^ids$|Ids$|token|hash|secret)/i.test(k)) continue;
    const text = value(k, v);
    if (text == null) continue;
    pairs.push(`${cap(words(k.replace(/(Cents|Bps)$/i, "")))}: ${text}`);
    if (pairs.length >= max) break;
  }
  return pairs.join(" · ");
}
