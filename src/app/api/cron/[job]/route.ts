// Scheduler endpoints: POST with `Authorization: Bearer $CRON_SECRET`.
//   /api/cron/frequent  every 15 min: campaigns held for a send window (CPA Reg 4), unpaid orders, invoice retries,
//                       founding numbers at launch, drop alerts, ledger postings waiting in the queue
//   /api/cron/daily     02:00 SAST: birthday points, uncollected orders, expired tier floors, reorder reminders, voucher expiry, loss-prevention rules and
//                       digest, My Deals (Mondays), deleting not-a-fit franchise leads after a year (POPIA), the day's
//                       postings to the books (and any a missed night left), then bank lines still open matched again
// Every step runs whatever happens to the others (src/server/jobs.ts). The answer is each step's result; when a step
// failed it comes after everything has run, as a 500 naming the failed steps, so `curl --fail` notices. Each run is
// recorded in JobRun: GET /api/health/jobs tells an uptime monitor when a job stops running or keeps failing.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sha256 } from "@/server/crypto";
import { JOBS, runJob } from "@/server/jobs";
import { db } from "@/server/db";

// The lock is held for the whole run, so it must outlast the longest job: daily, whose books step alone may take 20
// minutes on a catch-up night (ledgerNightly). A run cut off by this answers 500 and lets a second run start alongside.
const LOCK_TIMEOUT = 45 * 60_000;

export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(Buffer.from(sha256(given)), Buffer.from(sha256(`Bearer ${secret}`))))
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const job = (await params).job;
  if (!Object.hasOwn(JOBS, job)) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  // One run of a job at a time: a second scheduler call while it's still running is skipped. The lock lives on the
  // transaction's connection and ends with it, so a crashed run never leaves it held.
  const out = await db.$transaction(
    async (t) => {
      const [{ ok }] = await t.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`cron:${job}`})) AS ok`;
      return ok ? { ran: true as const, ...(await runJob(job)) } : { ran: false as const };
    },
    { timeout: LOCK_TIMEOUT, maxWait: 10_000 },
  );
  if (!out.ran) return NextResponse.json({ skipped: "already running" });
  if (out.failed.length) return NextResponse.json({ ...out.result, failed: out.failed }, { status: 500 });
  return NextResponse.json(out.result);
}
