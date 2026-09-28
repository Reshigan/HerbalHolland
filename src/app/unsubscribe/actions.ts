"use server";
import { setConsent } from "@/server/customers";
import { validOptOut } from "@/server/messaging";
import type { MsgChannel } from "@/generated/prisma/client";

export async function unsubscribe(_: unknown, form: FormData) {
  const [c, ch, t] = ["c", "ch", "t"].map((k) => String(form.get(k) ?? ""));
  if (!validOptOut(c, ch, t)) return { error: "This link isn't valid any more." };
  await setConsent(c, ch as MsgChannel, false, "UNSUBSCRIBE_LINK").catch(() => null);
  return { done: true };
}
