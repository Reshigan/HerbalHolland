// Till shift: current shift with a live X-report (GET), open with a counted float, and
// close with a denomination count → Z-report, printed at the till and emailed to the store.
import { z } from "zod";
import { json, readBody, withStaff } from "@/server/pos/http";
import { currentShift } from "@/server/pos/bootstrap";
import { closeShift, openShift, zReport } from "@/server/pos/shift";
import { countCash, DENOMINATIONS } from "@/components/pos/lib/rules";

export const GET = withStaff(async (_req, pos) => {
  const shift = await currentShift(pos.device);
  return json({ shift, report: shift ? await zReport(shift.id) : null });
});

// Denomination (cents) → number of notes/coins; unknown denominations are ignored.
const Counts = z
  .record(z.string(), z.number().int().min(0).max(100_000))
  .transform((c) => Object.fromEntries(DENOMINATIONS.map((d) => [String(d), c[String(d)] ?? 0])));

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), floatCents: z.number().int().min(0).max(5_000_000).optional(), counts: Counts.optional() }),
  z.object({ action: z.literal("close"), shiftId: z.string().min(1), counts: Counts, notes: z.string().trim().max(500).optional() }),
]);

export const POST = withStaff(async (req, pos) => {
  const b = await readBody(req, Body);
  if (b.action === "open") {
    const floatCents = b.counts ? countCash(b.counts) : (b.floatCents ?? 100_000);
    await openShift(pos, floatCents, b.counts);
    return json({ shift: await currentShift(pos.device) }, 201);
  }
  return json({ report: await closeShift(pos, b.shiftId, b.counts, b.notes) });
});
