// Customer display feed for a screen on another device: the till posts its snapshot (paired-device auth) and the
// display page polls it with ?d=<device id>&k=<pairing key>. Held in D1 for three minutes (server/pos/display).
import { z } from "zod";
import { fail, json, open, readBody, withDevice } from "@/server/pos/http";
import { clearSnapshot, getSnapshot, putSnapshot } from "@/server/pos/display";

const Body = z.object({
  key: z.string().regex(/^[a-z0-9]{12,32}$/, "Bad display key"),
  snapshot: z.object({ v: z.literal(1), state: z.string(), at: z.string() }).passthrough().nullable(),
});

export const POST = withDevice(async (req, device) => {
  const b = await readBody(req, Body);
  if (b.snapshot) await putSnapshot(device.id, b.key, b.snapshot);
  else await clearSnapshot(device.id);
  return json({ ok: true });
});

export const GET = open(async (req) => {
  const sp = new URL(req.url).searchParams;
  const d = sp.get("d") ?? "";
  const k = sp.get("k") ?? "";
  if (!/^[a-z0-9]{10,40}$/i.test(d) || !/^[a-z0-9]{12,32}$/.test(k)) return fail(400, "Open this page from the link the till shows under Shift → This till → Customer display");
  const hit = await getSnapshot(d, k);
  if (!hit) return fail(404, "No till is sending to this display right now", "NO_FEED");
  return json({ snapshot: hit.snapshot, ageMs: hit.ageMs });
});
