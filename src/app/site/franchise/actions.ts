"use server";
// The franchise enquiry form (src/components/site/enquiry-form.tsx). Anyone can post it: validation, the honeypot and
// the repeat limits live in createLead. The IP is only hashed there, never stored.
import { headers } from "next/headers";
import { clientIp, createLead, franchiseEmail } from "@/server/leads";
import type { LeadErrors, LeadField } from "@/lib/leads";

/** What the person typed, sent back after an error (React resets a form once its action has run). */
export type EnquiryValues = Partial<Record<LeadField, string>>;
export type EnquiryState = { ok?: boolean; number?: string | null; error?: string; fields?: LeadErrors; values?: EnquiryValues; at?: number };

const FIELDS: LeadField[] = ["name", "email", "phone", "area", "province", "experience", "capital", "pharmacist", "message", "consent"];

export async function enquire(_: EnquiryState, fd: FormData): Promise<EnquiryState> {
  const get = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v.slice(0, 4_000) : "";
  };
  const values = Object.fromEntries(FIELDS.map((k) => [k, get(k)])) as EnquiryValues;
  try {
    const r = await createLead({ ...values, source: get("source"), website: get("website") }, { ip: clientIp(await headers()) });
    if (r.ok) return { ok: true, number: r.number, at: Date.now() };
    return { error: r.error, fields: r.fields, values, at: Date.now() };
  } catch (e) {
    console.error("[franchise] enquiry failed", e);
    return { error: `Something went wrong sending your enquiry. Please try again in a minute, or email ${franchiseEmail()}.`, values, at: Date.now() };
  }
}
