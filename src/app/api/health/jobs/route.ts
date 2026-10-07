// For an uptime monitor: 200 while every scheduled job has finished cleanly within its window (frequent in the last 30
// minutes, daily in the last 26 hours…, JOB_WINDOWS in @/lib/jobs), otherwise 503 naming the late jobs with their
// times. A dead scheduler, a wrong CRON_SECRET or a job that keeps failing shows here. /api/health stays the
// container's liveness check: a stale scheduler is no reason to restart the app.
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { lateJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  try {
    const late = lateJobs(await db.jobRun.findMany({ select: { job: true, startedAt: true, okAt: true, failedAt: true } }), new Date());
    return NextResponse.json(late.length ? { ok: false, late } : { ok: true }, { status: late.length ? 503 : 200, headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503, headers: NO_STORE });
  }
}
