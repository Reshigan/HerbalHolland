// Scheduler endpoints — POST with `Authorization: Bearer $CRON_SECRET`.
//   /api/cron/frequent  every 15 min: campaigns held for a legal send window (CPA Reg 4), unpaid orders, invoice retries
//   /api/cron/daily     once a day (02:00 SAST): birthday points, uncollected pay-in-store orders
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sha256 } from "@/server/crypto";
import { JOBS } from "@/server/jobs";

export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(Buffer.from(sha256(given)), Buffer.from(sha256(`Bearer ${secret}`))))
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const run = JOBS[(await params).job];
  if (!run) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  return NextResponse.json(await run());
}
