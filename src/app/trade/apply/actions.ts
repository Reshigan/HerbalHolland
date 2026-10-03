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
  // "Deliver somewhere else" unticked: the delivery address typed earlier is ignored, not sent.
  if (form.get("otherDelivery") !== "on") for (const k of ["deliveryLine", "deliverySuburb", "deliveryCity", "deliveryProvince", "deliveryPostalCode"]) values[k] = "";
  values.otherDelivery = form.get("otherDelivery") === "on" ? "on" : "";
  const raw: RawTradeApplication = { ...values, classes, adult: values.adult === "on", terms: values.terms === "on" };
  const r = await applyForTradeAccount(raw, { source: "portal" });
  if (!r.ok) return { fields: r.fields, error: r.error, values };
  return { ok: true, number: r.account.number, buyerEmail: r.buyer.email };
}
