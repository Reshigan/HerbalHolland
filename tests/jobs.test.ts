import { describe, expect, it } from "vitest";
import { JOB_WINDOWS, lateJobs, runSteps, stepError } from "@/lib/jobs";

describe("scheduled jobs", () => {
  it("runs every step whatever the others do, and names the ones that failed", async () => {
    const ran: string[] = [];
    const reported: string[] = [];
    const step = (name: string, fail = false) => async () => {
      ran.push(name);
      if (fail) throw new Error(`SMTP refused mail for owner@example.co.za (${name})`);
      return { done: 1 };
    };
    const { result, failed } = await runSteps(
      { first: step("first", true), second: step("second"), trade: { holds: step("holds"), statements: step("statements", true) }, last: step("last") },
      async (_, where) => void reported.push(where),
    );
    expect(ran).toEqual(["first", "second", "holds", "statements", "last"]);
    expect(failed).toEqual(["first", "trade.statements"]);
    expect(reported).toEqual(failed);
    expect(result).toEqual({
      first: { error: "SMTP refused mail for [email] (first)" },
      second: { done: 1 },
      trade: { holds: { done: 1 }, statements: { error: "SMTP refused mail for [email] (statements)" } },
      last: { done: 1 },
    });
  });

  it("carries on when reporting a failure fails too", async () => {
    const { result, failed } = await runSteps({ a: async () => Promise.reject("down"), b: async () => 2 }, async () => Promise.reject(new Error("no mail either")));
    expect(failed).toEqual(["a"]);
    expect(result).toEqual({ a: { error: "down" }, b: 2 });
    expect(stepError(new Error("\nInvalid `prisma.order.findMany()` invocation:\n\nCan't reach database server\n"))).toBe("Can't reach database server");
  });

  it("calls a job late when it hasn't finished cleanly within its window, and says whether it's failing", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    const ago = (min: number) => new Date(now.getTime() - min * 60_000);
    const fresh = Object.keys(JOB_WINDOWS).map((job) => ({ job, startedAt: ago(5), okAt: ago(5), failedAt: null }));
    expect(lateJobs(fresh, now)).toEqual([]);
    const runs = fresh.map((r) =>
      r.job === "frequent" ? { ...r, okAt: ago(31), failedAt: ago(1) } // failing since its last clean run
      : r.job === "daily" ? { ...r, startedAt: ago(26 * 60 + 5), okAt: ago(26 * 60 + 1) } // the scheduler stopped calling
      : r.job === "operations" ? { ...r, okAt: ago(25 * 60), failedAt: ago(26 * 60) } // failed before, fine since
      : r,
    );
    expect(lateJobs(runs, now)).toEqual([
      { job: "frequent", state: "failing", startedAt: ago(5), okAt: ago(31), failedAt: ago(1) },
      { job: "daily", state: "stale", startedAt: ago(26 * 60 + 5), okAt: ago(26 * 60 + 1), failedAt: null },
    ]);
    expect(lateJobs([], now).map((j) => `${j.job} ${j.state}`)).toEqual(Object.keys(JOB_WINDOWS).map((job) => `${job} stale`)); // never run
    expect(lateJobs([{ job: "daily", startedAt: ago(10), okAt: null, failedAt: ago(9) }], now, { daily: JOB_WINDOWS.daily })).toEqual([
      { job: "daily", state: "failing", startedAt: ago(10), okAt: null, failedAt: ago(9) },
    ]);
  });
});
