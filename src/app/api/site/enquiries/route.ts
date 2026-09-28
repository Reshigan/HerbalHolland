// Franchise enquiries forwarded by the herbalholland.com Worker (sites/herbalholland.com/worker.ts) once the platform is
// live: `Authorization: Bearer $SITE_ENQUIRY_SECRET`. createLead checks them again, numbers the lead (FL-…), emails the
// team and acknowledges the enquirer — HQ works it at /hq/franchise.
import { timingSafeEqual } from "node:crypto";
import { sha256 } from "@/server/crypto";
import { createLead, type EnquiryInput } from "@/server/leads";

export async function POST(req: Request) {
  const secret = process.env.SITE_ENQUIRY_SECRET;
  const given = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(Buffer.from(sha256(given)), Buffer.from(sha256(`Bearer ${secret}`)))) return Response.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => null)) as (EnquiryInput & { ip?: unknown }) | null;
  if (!body || typeof body !== "object") return Response.json({ ok: false }, { status: 400 });
  const { ip, ...lead } = body;
  const r = await createLead(lead, { ip: typeof ip === "string" ? ip : null });
  return r.ok ? Response.json({ ok: true, number: r.number }) : Response.json({ ok: false, error: r.error, fields: r.fields }, { status: 422 });
}
