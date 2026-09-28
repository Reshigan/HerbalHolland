// Card-present session for tap on glass. With NEXT_PUBLIC_TAP_PROVIDER=HALO_APPLINK the
// till asks the server for a Halo Dot app-link (payments.createHaloSession) using the
// store's merchant ID; the simulated provider never calls this route.
import { z } from "zod";
import { createHaloSession, tapProvider } from "@/server/payments";
import { json, readBody, withStaff, PosError } from "@/server/pos/http";

const Body = z.object({ amountCents: z.number().int().min(100), reference: z.string().min(3).max(40) });

export const POST = withStaff(async (req, pos) => {
  const b = await readBody(req, Body);
  if (tapProvider() !== "HALO_APPLINK") throw new PosError(`Tap on glass is running in ${tapProvider()} mode on this till`, 400);
  const merchantId = process.env[`HALO_MERCHANT_ID_${pos.device.store.code}`] ?? process.env.HALO_MERCHANT_ID;
  if (!merchantId) throw new PosError("No Halo Dot merchant ID is set up for this store", 503);
  try {
    const session = await createHaloSession({ merchantId, amountCents: b.amountCents, reference: b.reference });
    return json(session);
  } catch (e) {
    throw new PosError((e as Error).message || "Couldn't reach Halo Dot", 502);
  }
});
