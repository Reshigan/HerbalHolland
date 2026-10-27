// Scheduled jobs, the pure parts: running a job's steps so that one failing can't stop the rest, and which jobs haven't
// finished cleanly within their window (the heartbeat /api/health/jobs reports). The jobs are in src/server/jobs.ts.
import { alertSummary, scrubAlert } from "./alerts";

const MIN = 60_000;

/** A job's steps in order; a group of steps nests, and so do its results. */
export type Steps = { [name: string]: (() => Promise<unknown>) | Steps };

/** A failed step's error as its result shows it: one line, personal details out (the response can end up in a log). */
export const stepError = (e: unknown) => alertSummary(scrubAlert(e instanceof Error ? e.message : String(e)));

/**
 * Runs every step in order, whatever happened to the ones before: a step that throws is handed to `report`, its result
 * is { error }, and the next step runs. Returns the results and the steps that failed ("trade.statements").
 */
export async function runSteps(steps: Steps, report: (err: unknown, step: string) => Promise<unknown>, at = ""): Promise<{ result: Record<string, unknown>; failed: string[] }> {
  const result: Record<string, unknown> = {};
  const failed: string[] = [];
  for (const [name, step] of Object.entries(steps)) {
    if (typeof step !== "function") {
      const group = await runSteps(step, report, `${at}${name}.`);
      result[name] = group.result;
      failed.push(...group.failed);
      continue;
    }
    try {
      result[name] = await step();
    } catch (e) {
      result[name] = { error: stepError(e) };
      failed.push(at + name);
      await report(e, at + name).catch(() => undefined);
    }
  }
  return { result, failed };
}

/** How long each scheduled job (src/server/jobs.ts) may go without a clean run before /api/health/jobs says so. */
export const JOB_WINDOWS: Record<string, number> = {
  frequent: 30 * MIN, // every 15 minutes
  "staff-push": 15 * MIN, // every 5 minutes
  daily: 26 * 60 * MIN, // 02:00 SAST
  operations: 26 * 60 * MIN, // 03:00 SAST
  morning: 26 * 60 * MIN, // 05:00 SAST
};

export type JobRunTimes = { job: string; startedAt: Date | null; okAt: Date | null; failedAt: Date | null };

/**
 * The jobs without a clean run inside their window: "failing" when the last run that finished failed, otherwise
 * "stale" (never run, or the scheduler stopped calling: a dead host cron, a wrong CRON_SECRET). Names and times only.
 */
export function lateJobs(runs: JobRunTimes[], now: Date, windows = JOB_WINDOWS) {
  return Object.entries(windows).flatMap(([job, within]) => {
    const r = runs.find((x) => x.job === job);
    if (r?.okAt && now.getTime() - r.okAt.getTime() <= within) return [];
    const failing = !!r?.failedAt && (!r.okAt || r.failedAt > r.okAt);
    return [{ job, state: failing ? ("failing" as const) : ("stale" as const), startedAt: r?.startedAt ?? null, okAt: r?.okAt ?? null, failedAt: r?.failedAt ?? null }];
  });
}
