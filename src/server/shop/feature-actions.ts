"use server";
// Storefront actions for the member features: wishlist hearts, reorder reminders, gift voucher codes and "buy again".
import { refresh } from "next/cache";
import { getCustomer } from "@/server/auth";
import { getVoucherCode, saveVoucherCode } from "./context";
import { toggleWishlist } from "./wishlist";
import { cancelReminder, REMINDER_DAYS, ReminderError, setReminder } from "./reminders";
import { reorderOrder, type ReorderResult } from "./reorder";
import { voucherForCheckout } from "./vouchers";
import type { ReminderChannel } from "@/generated/prisma/client";

// ── Wishlist ──────────────────────────────────────────────────────────────────
export type WishState = { on: boolean; error?: string };

export async function toggleWishlistAction(variantId: string): Promise<WishState> {
  const c = await getCustomer();
  if (!c) return { on: false, error: "Sign in to save items to your wishlist" };
  return toggleWishlist(c.id, variantId);
}

/** From the wishlist page (a form): removes the item and re-renders the list. */
export async function removeFromWishlist(form: FormData) {
  const c = await getCustomer();
  const variantId = String(form.get("variantId") ?? "");
  if (!c || !variantId) return;
  const r = await toggleWishlist(c.id, variantId);
  if (r.on) await toggleWishlist(c.id, variantId); // it wasn't there: undo the add
  refresh();
}

// ── Reorder reminders ─────────────────────────────────────────────────────────
export type ReminderState = { ok?: boolean; error?: string; id?: string; everyDays?: number; channel?: ReminderChannel };

export async function setReminderAction(variantId: string, _: ReminderState, form: FormData): Promise<ReminderState> {
  const c = await getCustomer();
  if (!c) return { error: "Sign in to set a reminder" };
  const everyDays = Number(form.get("everyDays"));
  const channel = ["SMS", "EMAIL", "PUSH"].find((k) => k === form.get("channel")) as ReminderChannel | undefined;
  if (!REMINDER_DAYS.includes(everyDays as (typeof REMINDER_DAYS)[number]) || !channel) return { error: "Choose how often and how we should remind you" };
  try {
    const r = await setReminder(c, variantId, everyDays, channel);
    return { ok: true, id: r.id, everyDays: r.everyDays, channel: r.channel };
  } catch (e) {
    if (e instanceof ReminderError) return { error: e.message };
    throw e;
  }
}

export async function cancelReminderAction(id: string): Promise<{ ok: boolean }> {
  const c = await getCustomer();
  if (!c) return { ok: false };
  const ok = await cancelReminder(c, id);
  refresh();
  return { ok };
}

/** From the reminders page (a form). */
export async function cancelReminderForm(form: FormData) {
  const c = await getCustomer();
  const id = String(form.get("id") ?? "");
  if (c && id) await cancelReminder(c, id);
  refresh();
}

// ── Gift vouchers at checkout ─────────────────────────────────────────────────
export type VoucherState = { error?: string; ok?: boolean };

export async function applyVoucherCode(_: VoucherState, form: FormData): Promise<VoucherState> {
  const raw = String(form.get("code") ?? "").trim();
  if (!raw) return { error: "Enter your voucher code" };
  const r = await voucherForCheckout(raw);
  if (!r.ok) return { error: r.error };
  await saveVoucherCode(r.voucher.code);
  refresh();
  return { ok: true };
}

export async function removeVoucherCode() {
  if (await getVoucherCode()) await saveVoucherCode(null);
  refresh();
}

// ── Buy again ─────────────────────────────────────────────────────────────────
export async function reorderAction(orderId: string): Promise<ReorderResult> {
  const c = await getCustomer();
  if (!c) return { ok: false, summary: "Sign in to buy again.", count: 0, added: 0, skipped: [] };
  return reorderOrder(c.id, orderId);
}
