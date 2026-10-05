"use client";
// The manual journal: lines of account, store (multi-store companies), the supplier, trade account or franchisee on
// control accounts, and a debit or a credit, with running totals that must balance before it can be saved. Saved as a
// draft, or posted straight away by someone who may approve.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";
import { parseRand } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export type FormAccount = { id: string; code: string; name: string; type: string; party: string | null };
type Line = { key: number; account: string; store: string; party: string; memo: string; debit: string; credit: string };

const TYPE_LABEL: Record<string, string> = { ASSET: "Assets", LIABILITY: "Liabilities", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expenses" };
const PARTY_HINT: Record<string, string> = { SUPPLIER: "Supplier's name", TRADE_ACCOUNT: "Trade account no. (TA-…)", COMPANY: "Franchisee" };
const blank = (key: number): Line => ({ key, account: "", store: "", party: "", memo: "", debit: "", credit: "" });
const cents = (s: string) => (s.trim() ? parseRand(s) : 0);

export function JournalForm({ action, accounts, stores, companies, canPost, approver, today, closedThrough }: {
  action: FormAction;
  accounts: FormAccount[];
  stores: { id: string; code: string; name: string }[]; // empty for a single-store company
  companies: { id: string; name: string }[]; // franchisees, for HQ's franchisee accounts
  canPost: boolean;
  approver: string; // who approves drafts here: "the owner", "an HQ administrator"
  today: string;
  closedThrough: string | null;
}) {
  const [lines, setLines] = useState<Line[]>([blank(1), blank(2)]);
  const [next, setNext] = useState(3);
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const amounts = lines.map((l) => ({ debit: cents(l.debit), credit: cents(l.credit) }));
  const bad = amounts.some((a) => a.debit == null || a.credit == null || a.debit < 0 || a.credit < 0);
  const debits = amounts.reduce((s, a) => s + (a.debit ?? 0), 0);
  const credits = amounts.reduce((s, a) => s + (a.credit ?? 0), 0);
  const balanced = !bad && debits > 0 && debits === credits;
  const groups = Object.keys(TYPE_LABEL).map((t) => ({ t, list: accounts.filter((a) => a.type === t) })).filter((g) => g.list.length);
  const cols = stores.length ? "sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_7.5rem_7.5rem_2.5rem]" : "sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_7.5rem_7.5rem_2.5rem]";

  return (
    <ActionForm action={action} className="space-y-5" aria-label="New journal">
      <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ account, store, party, memo, debit, credit }) => ({ account, store, party, memo, debit, credit })))} />
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field label="Date" htmlFor="j-date" hint={closedThrough ? `Months up to ${closedThrough} are closed` : undefined}>
          <Input id="j-date" name="date" type="date" defaultValue={today} required />
          <FieldError name="date" />
        </Field>
        <Field label="What it's for" htmlFor="j-memo">
          <Input id="j-memo" name="memo" maxLength={300} required placeholder="e.g. September depreciation, payroll from the payroll provider" />
          <FieldError name="memo" />
        </Field>
      </div>

      <div className="rounded-2xl border border-ink-150">
        <div className={cn("hidden gap-2 border-b border-ink-150 bg-ink-50/95 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500 sm:grid", cols)}>
          <span>Account</span>
          {stores.length > 0 && <span>Store</span>}
          <span>Supplier, account or note</span>
          <span className="text-right">Debit</span>
          <span className="text-right">Credit</span>
          <span className="sr-only">Remove</span>
        </div>
        <ul className="divide-y divide-ink-100">
          {lines.map((l, i) => {
            const acc = byId.get(l.account);
            const n = i + 1;
            return (
              <li key={l.key} className={cn("grid grid-cols-2 gap-2 p-3", cols)}>
                <Select aria-label={`Line ${n}: account`} value={l.account} onChange={(e) => set(l.key, { account: e.target.value, party: byId.get(e.target.value)?.party === acc?.party ? l.party : "" })} wrapperClassName="col-span-2 sm:col-span-1">
                  <option value="">Choose an account…</option>
                  {groups.map((g) => (
                    <optgroup key={g.t} label={TYPE_LABEL[g.t]}>
                      {g.list.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} {a.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                {stores.length > 0 && (
                  <Select aria-label={`Line ${n}: store`} value={l.store} onChange={(e) => set(l.key, { store: e.target.value })} wrapperClassName="col-span-2 sm:col-span-1">
                    <option value="">No store</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
                <div className="col-span-2 sm:col-span-1">
                  {acc?.party === "COMPANY" ? (
                    <Select aria-label={`Line ${n}: franchisee`} value={l.party} onChange={(e) => set(l.key, { party: e.target.value })}>
                      <option value="">Choose the franchisee…</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  ) : acc?.party ? (
                    <Input aria-label={`Line ${n}: ${PARTY_HINT[acc.party].toLowerCase()}`} value={l.party} onChange={(e) => set(l.key, { party: e.target.value })} placeholder={PARTY_HINT[acc.party]} maxLength={120} />
                  ) : (
                    <Input aria-label={`Line ${n}: note (optional)`} value={l.memo} onChange={(e) => set(l.key, { memo: e.target.value })} placeholder="Note (optional)" maxLength={200} />
                  )}
                </div>
                <Input aria-label={`Line ${n}: debit`} inputMode="decimal" value={l.debit} onChange={(e) => set(l.key, { debit: e.target.value, credit: e.target.value.trim() ? "" : l.credit })} placeholder="Debit" className={cn("tnum text-right", amounts[i].debit == null && "border-rose-400")} />
                <Input aria-label={`Line ${n}: credit`} inputMode="decimal" value={l.credit} onChange={(e) => set(l.key, { credit: e.target.value, debit: e.target.value.trim() ? "" : l.debit })} placeholder="Credit" className={cn("tnum text-right", amounts[i].credit == null && "border-rose-400")} />
                <Button type="button" variant="ghost" size="icon" className="col-span-2 justify-self-end sm:col-span-1" aria-label={`Remove line ${n}`} title="Remove line" disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-150 px-3 py-3">
          <Button type="button" variant="outline" size="sm" onClick={() => (setLines((ls) => [...ls, blank(next)]), setNext((k) => k + 1))}>
            <Plus className="h-4 w-4" aria-hidden />
            Add a line
          </Button>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" aria-live="polite">
            <span className="text-ink-500">
              Debits <span className="tnum font-semibold text-ink-900">{zar(debits)}</span>
            </span>
            <span className="text-ink-500">
              Credits <span className="tnum font-semibold text-ink-900">{zar(credits)}</span>
            </span>
            <span className={cn("font-semibold", balanced ? "text-leaf-700" : "text-amber-700")}>
              {bad ? "An amount isn't a number" : balanced ? "✓ Balanced" : debits === credits ? "Enter the amounts" : `Out by ${zar(Math.abs(debits - credits))}`}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-ink-500">
        Debit what the money went to (an expense, stock, an asset) and credit where it came from (the bank, a supplier, income). Each line takes a debit or a credit; the two totals must be the same.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canPost && (
          <SubmitButton name="intent" value="post" pendingLabel="Posting…" disabled={!balanced}>
            Post journal
          </SubmitButton>
        )}
        <SubmitButton name="intent" value="draft" variant={canPost ? "outline" : "primary"} pendingLabel="Saving…" disabled={!balanced}>
          Save as draft
        </SubmitButton>
        {!canPost && <span className="text-xs text-ink-500">A draft posts once {approver} approves it.</span>}
      </div>
    </ActionForm>
  );
}
