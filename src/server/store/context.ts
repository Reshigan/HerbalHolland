// Access control and error handling for store back-office server actions.
// Pages call requireStaff() + storeForUser(); every action re-checks both through
// manage(code) before touching a row, and runs its body through attempt() so domain
// errors come back as inline messages instead of error pages.
import { unstable_rethrow } from "next/navigation";
import { requireStaff, type Staff } from "@/server/auth";
import { reportFailure } from "@/server/alerts";
import { canManageStore, storeForUser } from "@/server/scope";
import { StockError } from "@/server/inventory";
import { PurchaseError } from "@/server/stock-orders";
import { OrderError } from "@/server/orders";
import { CustomerError } from "@/server/customers";
import { CampaignError } from "@/server/marketing";
import type { Actor } from "@/server/audit";
import { BankingError } from "@/server/banking";
import { CommissionError } from "@/server/commission";

export type ActionState = { ok?: string; error?: string; fields?: Record<string, string>; at?: number };

/** An expected, user-facing failure. */
export class UserError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

export const fail = (error: string, field?: string): ActionState => ({ error, fields: field ? { [field]: error } : undefined, at: Date.now() });
export const done = (ok: string): ActionState => ({ ok, at: Date.now() });

export const actorOf = (u: Pick<Staff, "id" | "name">): Actor => ({ type: "USER", id: u.id, name: u.name });

/** Signed-in staff member who may change this store (managers, owners, HQ admin). */
export async function manage(code: string) {
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  if (!canManageStore(user)) throw new UserError("You have read-only access to this store.");
  return { user, store, actor: actorOf(user) };
}

const EXPECTED = [UserError, StockError, PurchaseError, OrderError, CustomerError, CampaignError, BankingError, CommissionError];

/** Runs an action body; expected errors become inline messages, redirects pass through. */
export async function attempt(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (EXPECTED.some((E) => e instanceof E)) return fail((e as Error).message, (e as UserError).field);
    if ((e as { code?: string })?.code === "P2002") return fail("That already exists. Check for a duplicate.");
    void reportFailure(e, "store back-office action"); // unexpected: logged and emailed to ops
    return fail("Something went wrong. Please try again.");
  }
}
