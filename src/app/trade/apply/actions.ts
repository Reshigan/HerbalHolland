"use server";
// The trade application: the form's fields go to applyForTradeAccount as typed; problems come back by field, with
// everything typed so React's post-action form reset loses nothing. No sign-in needed.
import { applyForTradeAccount } from "@/server/trade/accounts";
import type { RawTradeApplication, TradeErrors } from "@/lib/trade";

export type ApplyState = {
  ok?: true;
  number?: string;
  buyerEmail?: string;
  error?: string;
  fields?: TradeErrors;
  values?: Record<string, string>;
  at?: number; // when a refused submit came back (the form re-keys what React's reset would otherwise lose)
};

const TEXT = [
  "legalName", "name", "kind", "regNumber", "vatNumber", "email", "phone", "addressLine", "suburb", "city", "province", "postalCode",
  "deliveryLine", "deliverySuburb", "deliveryCity", "deliveryProvince", "deliveryPostalCode", "buyerName", "buyerEmail", "buyerPhone", "notes",
] as const;

export async function applyAction(_: ApplyState, form: FormData): Promise<ApplyState> {
  const values: Record<string, string> = Object.fromEntries(TEXT.map((k) => [k, String(form.get(k) ?? "").slice(0, 2_000)]));
  const classes = form.getAll("classes").map((c) => String(c).slice(0, 20));
  values.classes = classes.join(" ");
  values.adult = form.get("adult") === "on" ? "on" : "";
  values.terms = form.get("terms") === "on" ? "on" : "";
  // The delivery fields are only in the form while "Deliver somewhere else" is open; remember that for the re-render.
  values.otherDelivery = form.has("deliveryLine") ? "on" : "";
  const raw: RawTradeApplication = { ...values, classes, adult: values.adult === "on", terms: values.terms === "on" };
  const r = await applyForTradeAccount(raw, { source: "portal" });
  if (!r.ok) return { fields: r.fields, error: r.error, values, at: Date.now() };
  return { ok: true, number: r.account.number, buyerEmail: r.buyer.email };
}
