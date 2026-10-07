"use server";
// The trade application: the form's fields and the licence documents go to applyForTradeAccount as typed; problems
// come back by field, with everything typed so React's post-action form reset loses nothing but the files (a browser
// can't refill a file input, so the form says to attach them again). No sign-in needed; an hourly limit per connection.
import { headers } from "next/headers";
import { applyForTradeAccount } from "@/server/trade/accounts";
import { clientIp } from "@/server/leads";
import { applicationFromForm, licenceInputName, TRADE_TEXT_FIELDS, type TradeErrors } from "@/lib/trade";
import { TRADE_LICENCE_KINDS } from "@/lib/trade-licences";

export type ApplyState = {
  ok?: true;
  number?: string;
  buyerEmail?: string;
  error?: string;
  fields?: TradeErrors;
  values?: Record<string, string>;
  at?: number; // when a refused submit came back (the form re-keys what React's reset would otherwise lose)
};

export async function applyAction(_: ApplyState, form: FormData): Promise<ApplyState> {
  const raw = applicationFromForm(form);
  const values: Record<string, string> = Object.fromEntries(TRADE_TEXT_FIELDS.map((k) => [k, String(raw[k] ?? "")]));
  values.classes = (raw.classes as string[]).join(" ");
  values.adult = raw.adult ? "on" : "";
  values.terms = raw.terms ? "on" : "";
  // The delivery fields are only in the form while "Deliver somewhere else" is open; remember that for the re-render.
  values.otherDelivery = form.has("deliveryLine") ? "on" : "";
  for (const k of TRADE_LICENCE_KINDS) {
    values[licenceInputName(k, "number")] = raw.licences?.[k]?.number ?? "";
    values[licenceInputName(k, "expiresAt")] = raw.licences?.[k]?.expiresAt ?? "";
  }
  const files = Object.fromEntries(
    TRADE_LICENCE_KINDS.map((k) => [k, form.get(licenceInputName(k, "file"))] as const).filter((e): e is [typeof e[0], File] => e[1] instanceof File && e[1].size > 0),
  );
  const r = await applyForTradeAccount(raw, { source: "portal", ip: clientIp(await headers()), files });
  if (!r.ok) return { fields: r.fields, error: r.error, values, at: Date.now() };
  return { ok: true, number: r.account.number, buyerEmail: r.buyer.email };
}
