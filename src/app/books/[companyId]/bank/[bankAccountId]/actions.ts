"use server";
import { redirect } from "next/navigation";
import {
  allocateLine, ignoreLine, LINE_FILTERS, matchAutomatically, matchLine, setBankAccountActive, unallocateLine, unignoreLine, unmatchLine, updateBankAccount,
} from "@/server/ledger/bank";
import { done, fail, type ActionState } from "@/server/store/context";
import { parseRand, str } from "@/server/store/rules";
import { plural } from "@/lib/plural";
import { act, refresh } from "../act";

/**
 * Back to the list the line was settled from (its filter and page, nothing else from the client), with a one-time
 * message: the row, and the form that would have shown it, has moved on.
 */
function back(companyId: string, bankAccountId: string, view: string, message: string): never {
  const from = new URLSearchParams(view);
  const to = new URLSearchParams();
  const show = from.get("show");
  if (show && Object.hasOwn(LINE_FILTERS, show)) to.set("show", show);
  if (/^\d{1,4}$/.test(from.get("page") ?? "")) to.set("page", from.get("page")!);
  to.set("m", message);
  if (!/^[a-z0-9-]+$/i.test(companyId) || !/^[a-z0-9-]+$/i.test(bankAccountId)) redirect("/books"); // cuids and UUIDs
  redirect(`/books/${companyId}/bank/${bankAccountId}?${to}`);
}

export async function editBankAccount(companyId: string, bankAccountId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return act(async () => {
    const a = await updateBankAccount(companyId, bankAccountId, { name: str(fd, "name"), number: str(fd, "number"), storeId: str(fd, "storeId") || null });
    refresh(companyId, bankAccountId);
    return done(`Saved ${a.name}.`);
  });
}

export async function setAccountOpen(companyId: string, bankAccountId: string, active: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return act(async () => {
    const a = await setBankAccountActive(companyId, bankAccountId, active);
    refresh(companyId, bankAccountId);
    return done(active ? `${a.name} is open again.` : `${a.name} is closed: nothing more is imported to it. Its lines and postings stay.`);
  });
}

export async function matchNow(companyId: string, bankAccountId: string, view: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return act(async () => {
    const n = await matchAutomatically(companyId, bankAccountId);
    refresh(companyId, bankAccountId);
    back(companyId, bankAccountId, view, n ? `${plural(n, "line")} matched.` : "Nothing more matches by itself. Match or allocate the rest.");
  });
}

/** One-click match to a suggested posting (journalId), or to the journal number typed in. */
export async function matchTo(companyId: string, bankAccountId: string, lineId: string, journalId: string | null, view: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return act(async () => {
    const number = Number(str(fd, "number").replace(/^#/, ""));
    if (!journalId && !(Number.isInteger(number) && number > 0)) return fail("Enter the journal number", "number");
    const r = await matchLine(companyId, lineId, journalId ? { id: journalId } : { number });
    refresh(companyId, bankAccountId);
    back(companyId, bankAccountId, view, `Matched to journal ${r.number}.`);
  });
}

export async function unmatch(companyId: string, bankAccountId: string, lineId: string, view: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return act(async () => {
    await unmatchLine(companyId, lineId);
    refresh(companyId, bankAccountId);
    back(companyId, bankAccountId, view, "Unmatched. The line is back on the to-do list.");
  });
}

export async function ignore(companyId: string, bankAccountId: string, lineId: string, view: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return act(async () => {
    await ignoreLine(companyId, lineId, str(fd, "reason"));
    refresh(companyId, bankAccountId);
    back(companyId, bankAccountId, view, "Line ignored. It's under Ignored if you need it back.");
  });
}

export async function restore(companyId: string, bankAccountId: string, lineId: string, view: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return act(async () => {
    await unignoreLine(companyId, lineId);
    refresh(companyId, bankAccountId);
    back(companyId, bankAccountId, view, "Restored. The line is back on the to-do list.");
  });
}

/** Rand typed in → cents; empty is none. */
function rand(fd: FormData, name: string): number | null | "bad" {
  const v = str(fd, name);
  if (!v) return null;
  const c = parseRand(v);
  return c == null || c < 0 ? "bad" : c;
}

export async function allocate(companyId: string, bankAccountId: string, lineId: string, view: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return act(async () => {
    const storeId = str(fd, "storeId") || null;
    const memo = str(fd, "memo").slice(0, 200) || null;
    let r: { number: number; to: string };
    if (str(fd, "mode") === "payout") {
      const fee = rand(fd, "fee"), feeVat = rand(fd, "feeVat");
      if (fee === "bad" || fee == null) return fail("Enter the fee taken off the payout (0 if none)", "fee");
      if (feeVat === "bad") return fail("Enter the VAT on the fee in rand, or leave it empty", "feeVat");
      r = await allocateLine(companyId, lineId, { kind: "payout", feeCents: fee, feeVatCents: feeVat ?? 0, clears: str(fd, "clears") === "gateway" ? "gateway" : "card", storeId, memo });
    } else {
      const accountId = str(fd, "accountId");
      if (!accountId) return fail("Choose the account", "accountId");
      const vat = rand(fd, "vat");
      if (vat === "bad") return fail("Enter the VAT in rand, or leave it empty", "vat");
      r = await allocateLine(companyId, lineId, { kind: "account", accountId, storeId, party: str(fd, "party") || null, vatCents: vat ?? 0, memo });
    }
    refresh(companyId, bankAccountId);
    back(companyId, bankAccountId, view, `Allocated to ${r.to} (journal ${r.number}).`);
  });
}

export async function unallocate(companyId: string, bankAccountId: string, lineId: string, view: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return act(async () => {
    const r = await unallocateLine(companyId, lineId);
    refresh(companyId, bankAccountId);
    back(companyId, bankAccountId, view, r.reversal ? `Allocation taken back. Journal ${r.reversal} reverses it.` : "Allocation taken back.");
  });
}
