// Request schemas shared by the /api/pos/* route handlers.
import { z } from "zod";

export const Items = z.array(z.object({ variantId: z.string().min(1), qty: z.number().int().min(1).max(999) })).max(200);

export const Tender = z.object({
  method: z.enum(["CARD", "CASH", "PAYSHAP", "EFT"]),
  amountCents: z.number().int().min(1, "Tender amounts must be positive"),
  tenderedCents: z.number().int().min(0).optional(),
  changeCents: z.number().int().min(0).optional(),
  provider: z.string().max(40).optional(),
  reference: z.string().trim().max(60).optional(),
  cardBrand: z.string().max(20).optional(),
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
});

export const AgeCheck = z.enum(["NONE", "ID_SIGHTED", "ID_NUMBER", "VERIFIED"]);

export const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Expected a client UUID");
