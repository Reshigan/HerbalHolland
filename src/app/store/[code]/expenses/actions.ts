"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { queuePosting } from "@/server/ledger/core";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { bool, parseDay, parseRand, str } from "@/server/store/rules";
import { vatOf, zar } from "@/lib/money";
import type { ExpenseCategory } from "@/generated/prisma/client";

const CATEGORIES: ExpenseCategory[] = ["RENT", "SALARIES", "UTILITIES", "SECURITY", "MARKETING", "SUPPLIES", "BANK_FEES", "OTHER"];

export async function addExpense(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const date = parseDay(str(fd, "date"));
    if (!date) return fail("Choose the invoice date", "date");
    if (date > new Date()) return fail("The date can't be in the future", "date");
    if (date < new Date(Date.now() - 400 * 86_400_000)) return fail("That's more than a year ago. Check the date.", "date");
    const category = str(fd, "category") as ExpenseCategory;
    if (!CATEGORIES.includes(category)) return fail("Choose a category", "category");
    const description = str(fd, "description").slice(0, 160);
    if (description.length < 3) return fail("Describe the expense", "description");
    const amount = parseRand(str(fd, "amount"));
    if (amount == null || amount <= 0 || amount > 100_000_000) return fail("Enter the amount including VAT", "amount");
    const claim = bool(fd, "vatClaimable") && !!store.company.vatNumber;
    const e = await db.expense.create({
      data: {
        storeId: store.id,
        date: new Date(date.getTime() + 12 * 3_600_000), // midday SAST keeps the business day stable
        category,
        description,
        supplier: str(fd, "supplier").slice(0, 120) || null,
        amountCents: amount,
        vatCents: claim ? vatOf(amount) : 0,
        createdById: user.id,
      },
    });
    await queuePosting(db, "expense", e.id);
    await audit(db, actor, "expense.create", { storeId: store.id, entity: "Expense", entityId: e.id, data: { category, amountCents: amount, vatCents: e.vatCents } });
    revalidatePath(`/store/${store.code}/expenses`);
    revalidatePath(`/store/${store.code}/finance`);
    return done(`Added ${zar(amount)} for ${description}${claim ? ` (VAT ${zar(e.vatCents)} claimable)` : ""}.`);
  });
}

export async function deleteExpense(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const e = await db.expense.findFirst({ where: { id, storeId: store.id } });
    if (!e) return fail("Expense not found");
    await db.expense.delete({ where: { id } });
    await queuePosting(db, "expense", id); // reversed in the books
    await audit(db, actor, "expense.delete", { storeId: store.id, entity: "Expense", entityId: id, data: { category: e.category, amountCents: e.amountCents, description: e.description } });
    revalidatePath(`/store/${store.code}/expenses`);
    revalidatePath(`/store/${store.code}/finance`);
    return done("Expense removed.");
  });
}
