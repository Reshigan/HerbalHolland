// Trade-sale mode: the till's trade account lookup — approved accounts (and those on hold, who may still pay in
// money) by trading or legal name, number (TA-…, however typed) or VAT number, with their terms, balance and what
// may still go on account right now (domain: trade/accounts.tradeAccountLookup). Read-only, so training mode may
// call it; the account is checked again when the sale posts.
import { z } from "zod";
import { tradeAccountLookup } from "@/server/trade/accounts";
import { json, readBody, withStaff } from "@/server/pos/http";
import type { TradeAccountDTO } from "@/server/pos/types";

const Body = z.object({ q: z.string().trim().min(2, "Type at least two characters of the name, number or VAT number").max(100) });

export const POST = withStaff(async (req) => {
  const b = await readBody(req, Body);
  const hits = await tradeAccountLookup(b.q);
  const accounts: TradeAccountDTO[] = hits
    .filter((h) => h.status === "APPROVED" || h.status === "ON_HOLD")
    .map((h) => ({
      id: h.id,
      number: h.number,
      name: h.name,
      legalName: h.legalName,
      vatNumber: h.vatNumber,
      status: h.status as "APPROVED" | "ON_HOLD",
      terms: h.terms,
      classes: h.classes,
      creditLimitCents: h.creditLimitCents,
      paymentDays: h.paymentDays,
      balanceCents: h.balanceCents,
      availableCents: h.availableCents,
      licenceProblem: h.licenceProblem,
    }));
  return json({ accounts });
});
