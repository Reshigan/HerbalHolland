"use server";
// The support form (/support): members and visitors alike. The service does the honeypot, the checks, the limits and
// the acknowledgement; a member is sent to their request afterwards, a visitor sees the number to quote.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth";
import { clientIp } from "@/server/leads";
import { createTicket } from "@/server/support";
import type { TicketErrors } from "@/lib/support";

export type TicketFormState = { ok?: boolean; number?: string | null; error?: string; fields?: TicketErrors; values?: Record<string, string> };
const FIELDS = ["name", "email", "phone", "subject", "category", "orderCode", "body"] as const;

/** React resets the form when the action returns: what was typed comes back with any error, so nothing is lost. */
export async function submitTicket(_: TicketFormState, fd: FormData): Promise<TicketFormState> {
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? "")]));
  const customer = await getCustomer();
  const r = await createTicket(
    { ...values, consent: String(fd.get("consent") ?? ""), website: String(fd.get("website") ?? "") },
    { customer, ip: customer ? null : clientIp(await headers()) },
  );
  if (!r.ok) return { error: r.error, fields: r.fields, values };
  if (customer && r.id) redirect(`/club/support/${r.id}?sent=1`);
  return { ok: true, number: r.number };
}
