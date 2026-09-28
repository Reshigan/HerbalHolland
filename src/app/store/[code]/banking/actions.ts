"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { canVerify, recordDeposit, reviewDeposit } from "@/server/banking";
import { getSettings } from "@/server/settings";
import { actorOf, attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { list, parseDay, parseRand, plural, str } from "@/server/store/rules";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { addDays, dayKey } from "@/lib/format";
import { zar } from "@/lib/money";

const refresh = (code: string) => {
  revalidatePath(`/store/${code}/banking`);
  revalidatePath(`/store/${code}/cash-ups`);
};

export async function addDeposit(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const shiftIds = list(fd, "shift");
    if (!shiftIds.length) return fail("Tick the cash-ups this deposit covers", "shift");
    if (shiftIds.length > 200) return fail("That's more than 200 cash-ups — record them in smaller deposits", "shift");
    const amount = parseRand(str(fd, "amount"));
    if (amount == null || amount <= 0 || amount > 100_000_000) return fail("Enter the amount on the deposit slip", "amount");
    const day = str(fd, "bankedOn");
    if (!parseDay(day)) return fail("Choose the day the cash was banked", "bankedOn");
    const today = dayKey(new Date());
    if (day > today) return fail("The date can't be in the future", "bankedOn");
    if (day < dayKey(addDays(new Date(), -60))) return fail("That's more than 60 days ago — check the date", "bankedOn");
    const reference = str(fd, "reference").replace(/\s+/g, " ");
    if (!reference) return fail("Enter the deposit reference from the slip", "reference");
    if (reference.length > 40) return fail("Keep the reference to 40 characters", "reference");
    const file = fd.get("slip");
    if (!(file instanceof File) || !file.size) return fail("Add a photo or PDF of the stamped deposit slip", "slip");
    if (file.size > MAX_UPLOAD_BYTES) return fail("The slip is over 10 MB — take the photo again or use a smaller PDF", "slip");

    const d = await recordDeposit(
      {
        storeId: store.id,
        storeCode: store.code,
        shiftIds,
        amountCents: amount,
        bankedOn: new Date(`${day}T00:00:00Z`), // a DATE column: the calendar day itself
        reference,
        note: str(fd, "note").slice(0, 300) || null,
        file,
      },
      { ...actor, id: user.id },
    );
    refresh(store.code);
    const diff = d.amountCents - d.expectedCents;
    const covers = plural(shiftIds.length, "cash-up");
    if (diff === 0) return done(`Recorded ${d.number}: ${zar(d.amountCents)} for ${covers} — it matches the cash counted.`);
    if (diff > 0) return done(`Recorded ${d.number}: ${zar(d.amountCents)} for ${covers} — ${zar(diff)} over the ${zar(d.expectedCents)} counted.`);
    const { banking } = await getSettings();
    return done(
      `Recorded ${d.number}: ${zar(d.amountCents)} for ${covers} — ${zar(-diff)} short of the ${zar(d.expectedCents)} counted.${-diff > banking.shortToleranceCents ? " Your owner and area manager have been alerted." : ""}`,
    );
  });
}

/** Owners, area managers and HQ check deposits (never their own — the service enforces that). */
async function checker(code: string) {
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  if (!canVerify(user.role)) throw new UserError("Owners, area managers and HQ check deposits against the bank statement.");
  return { store, actor: { ...actorOf(user), id: user.id } };
}

export async function verifyDeposit(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await checker(code);
    const d = await reviewDeposit(id, store.id, "VERIFIED", str(fd, "note").slice(0, 300) || null, actor);
    refresh(store.code);
    return done(`${d.number} verified against the bank statement and locked.`);
  });
}

export async function queryDeposit(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await checker(code);
    const note = str(fd, "note").slice(0, 300);
    if (note.length < 3) return fail("Say what doesn't match the bank statement", "note");
    const d = await reviewDeposit(id, store.id, "QUERIED", note, actor);
    refresh(store.code);
    return done(`${d.number} queried — the store sees your note.`);
  });
}
