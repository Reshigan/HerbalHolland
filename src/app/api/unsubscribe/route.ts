// One-click unsubscribe (RFC 8058): mail clients POST here from the List-Unsubscribe header. People who click the
// link in a message land on /unsubscribe and confirm there, so link scanners can't opt anyone out.
import { NextResponse } from "next/server";
import { setConsent } from "@/server/customers";
import { validOptOut } from "@/server/messaging";
import type { MsgChannel } from "@/generated/prisma/client";

const params = (req: Request) => new URL(req.url).searchParams;

export async function POST(req: Request) {
  const [c, ch, t] = ["c", "ch", "t"].map((k) => params(req).get(k) ?? "");
  if (!validOptOut(c, ch, t)) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  await setConsent(c, ch as MsgChannel, false, "UNSUBSCRIBE_LINK").catch(() => null); // member since erased: nothing to do
  return NextResponse.json({ ok: true });
}

export function GET(req: Request) {
  return NextResponse.redirect(new URL(`/unsubscribe?${params(req)}`, req.url));
}
