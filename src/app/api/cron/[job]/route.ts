// Scheduler endpoints — POST with `Authorization: Bearer $CRON_SECRET`.
//   /api/cron/frequent  every 15 min: campaigns held for a send window (CPA Reg 4), unpaid orders, invoice retries,
//                       founding numbers at launch, drop alerts, ledger postings waiting in the queue
//   /api/cron/daily     02:00 SAST: birthday points, uncollected orders, expired tier floors, reorder reminders, voucher expiry, loss-prevention rules and
//                       digest, My Deals (Mondays), deleting not-a-fit franchise leads after a year (POPIA), the day's
//                       postings to the books, then bank lines still open matched again
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sha256 } from "@/server/crypto";
import { JOBS } from "@/server/jobs";
import { db } from "@/server/db";

export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(Buffer.from(sha256(given)), Buffer.from(sha256(`Bearer ${secret}`))))
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const run = JOBS[(await params).job];
  if (!run) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  // One run of a job at a time: a second scheduler call while it's still running is skipped. The lock lives on the
  // transaction's connection and ends with it, so a crashed run never leaves it held.
  const job = (await params).job;
  const out = await db.$transaction(
    async (t) => {
      const [{ ok }] = await t.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`cron:${job}`})) AS ok`;
      return ok ? { ran: true as const, result: await run() } : { ran: false as const };
    },
    { timeout: 15 * 60_000, maxWait: 10_000 },
  );
  return NextResponse.json(out.ran ? out.result : { skipped: "already running" });
}
