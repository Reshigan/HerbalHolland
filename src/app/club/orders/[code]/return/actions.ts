"use server";
// A member's return request on their own order. The service checks the window and the items again, stores the photos
// and tells the member; the page then shows the request with its status.
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth";
import { requestReturn, ReturnError } from "@/server/returns";
import { filesIn, UploadError } from "@/server/uploads";

export type ReturnFormState = { error?: string; field?: string; values?: { reason: string; note: string } };

export async function requestReturnAction(orderCode: string, _: ReturnFormState, fd: FormData): Promise<ReturnFormState> {
  const customer = await getCustomer();
  if (!customer) return { error: "Please sign in again" };
  const reason = String(fd.get("reason") ?? "");
  const note = String(fd.get("note") ?? "");
  const items = [...fd.entries()].filter(([k]) => k.startsWith("qty:")).map(([k, v]) => ({ variantId: k.slice(4), qty: String(v) }));
  let number: string;
  try {
    const r = await requestReturn({ orderCode, reason, items, note, sealedConfirmed: ["on", "true"].includes(String(fd.get("sealed") ?? "")), photos: filesIn(fd, "photos") }, customer);
    number = r.number;
  } catch (e) {
    if (e instanceof ReturnError || e instanceof UploadError) return { error: e.message, field: e instanceof ReturnError ? e.field : "photos", values: { reason, note } };
    throw e;
  }
  redirect(`/club/orders/${orderCode}/return?done=${number}`);
}
