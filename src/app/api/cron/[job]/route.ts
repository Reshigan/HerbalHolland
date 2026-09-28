// Scheduler endpoints — POST with `Authorization: Bearer $CRON_SECRET`.
//   /api/cron/frequent  every 15 min: campaigns held for a send window (CPA Reg 4), unpaid orders, invoice retries,
//                       founding numbers at launch, drop alerts
//   /api/cron/daily     02:00 SAST: birthday points, uncollected orders, expired tier floors, loss-prevention rules and
//                       digest, My Deals (Mondays)
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
