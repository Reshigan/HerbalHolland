// The scheduler holding up when something breaks: every step of a job runs whatever happens to the others (a failed
// step is reported, shows in the result, and the run is recorded as failed), the heartbeat /api/health/jobs reads,
// the cron route's answers, and the isolation and catch-up inside the jobs: the loss-prevention digest, campaigns,
// trade statements after a missed statement day, bank auto-matching, and the books' first close.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, tx } from "@/server/db";
import { JOBS, runJob } from "@/server/jobs";
import { sendDigest } from "@/server/loss";
import { runDueCampaigns } from "@/server/marketing";
import { tradeStatements } from "@/server/trade/jobs";
import { statementLogId } from "@/server/trade/ledger";
import { autoMatchAll, createBankAccount } from "@/server/ledger/bank";
import { queuePosting, syncPosting } from "@/server/ledger/core";
import { postQueueBeforeClose } from "@/server/ledger/admin";
import { GET as jobsHealth } from "@/app/api/health/jobs/route";
import { POST as cron } from "@/app/api/cron/[job]/route";
import { JOB_WINDOWS } from "@/lib/jobs";
import { addDays, dayKey } from "@/lib/format";
import { buildWorld, resetDb, type World } from "./world";

// The mail server refuses the addresses in `mail.refuse`, as it would a mailbox that doesn't exist.
const mail = vi.hoisted(() => ({ refuse: new Set<string>() }));
vi.mock("@/server/email", async (real) => {
  const m = await real<typeof import("@/server/email")>();
  return {
    ...m,
    sendEmail: async (e: Parameters<typeof m.sendEmail>[0]) => {
      if (mail.refuse.has(e.to)) throw new Error(`550 5.1.1 <${e.to}>: mailbox unavailable`);
      return m.sendEmail(e);
    },
  };
});

let w: World;
const daysAgo = (n: number) => dayKey(addDays(new Date(), -n));

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await db.$disconnect();
});

describe("A scheduled job", () => {
  it("has a health window for every job", () => {
    expect(Object.keys(JOB_WINDOWS).sort()).toEqual(Object.keys(JOBS).sort());
  });

  it("runs every step when one fails, and records the run as failed until one is clean", async () => {
    const lossPrevention = JOBS.daily.lossPrevention;
    JOBS.daily.lossPrevention = async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:587 while mailing owner@example.co.za"); // the 02:00 mail outage
    };
    try {
      const { result, failed } = await runJob("daily");
      expect(failed).toEqual(["lossPrevention"]);
      expect(result.lossPrevention).toEqual({ error: "connect ECONNREFUSED 10.0.0.5:587 while mailing [email]" });
      // What comes after it still ran: reminders, trade statements, the books and the bank.
      expect(result).toMatchObject({ reminders: { failed: 0 }, trade: { statements: { failed: 0 } }, ledger: { queued: expect.any(Number) }, bank: { failed: 0 } });
    } finally {
      JOBS.daily.lossPrevention = lossPrevention;
    }
    const failedRun = await db.jobRun.findUniqueOrThrow({ where: { job: "daily" } });
    expect(failedRun).toMatchObject({ okAt: null, failedAt: expect.any(Date), error: "Failed: lossPrevention" });
    expect(failedRun.startedAt!.getTime()).toBeLessThanOrEqual(failedRun.failedAt!.getTime());

    expect((await runJob("daily")).failed).toEqual([]);
    const clean = await db.jobRun.findUniqueOrThrow({ where: { job: "daily" } });
    expect(clean.okAt!.getTime()).toBeGreaterThan(clean.failedAt!.getTime());
    await expect(runJob("constructor")).rejects.toThrow('no scheduled job "constructor"');
  });

  it("answers the scheduler: 401 without the secret, 404 for no such job, 500 naming the failed step after the rest ran", async () => {
    vi.stubEnv("CRON_SECRET", "integration-cron-secret");
    const call = (job: string, secret = "integration-cron-secret") =>
      cron(new Request(`http://localhost/api/cron/${job}`, { method: "POST", headers: { authorization: `Bearer ${secret}` } }), { params: Promise.resolve({ job }) });
    expect((await call("frequent", "wrong")).status).toBe(401);
    expect((await call("weekly")).status).toBe(404);
    expect((await call("toString")).status).toBe(404);
    const campaigns = JOBS.frequent.campaigns;
    JOBS.frequent.campaigns = async () => {
      throw new Error("The SMS gateway is down");
    };
    try {
      const r = await call("frequent");
      expect(r.status).toBe(500);
      expect(await r.json()).toMatchObject({ campaigns: { error: "The SMS gateway is down" }, unpaidOrders: { failed: 0 }, ledger: { posted: expect.any(Number) }, failed: ["campaigns"] });
    } finally {
      JOBS.frequent.campaigns = campaigns;
    }
    const ok = await call("frequent");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ campaigns: 0, ledger: { posted: expect.any(Number) } });
    vi.unstubAllEnvs();
  });

  it("tells an uptime monitor which jobs haven't run cleanly in time: names and times only", async () => {
    await db.jobRun.deleteMany();
    let r = await jobsHealth();
    expect(r.status).toBe(503);
    expect(((await r.json()) as { late: { job: string; state: string }[] }).late.map((j) => `${j.job} ${j.state}`)).toEqual(Object.keys(JOB_WINDOWS).map((job) => `${job} stale`));

    const now = new Date();
    await db.jobRun.createMany({ data: Object.keys(JOB_WINDOWS).map((job) => ({ job, startedAt: now, okAt: now })) });
    r = await jobsHealth();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });

    const lastOk = new Date(now.getTime() - 40 * 60_000);
    await db.jobRun.update({ where: { job: "frequent" }, data: { okAt: lastOk, failedAt: now, error: "Failed: ledger" } });
    r = await jobsHealth();
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ ok: false, late: [{ job: "frequent", state: "failing", startedAt: now.toISOString(), okAt: lastOk.toISOString(), failedAt: now.toISOString() }] });
  });
});

describe("Inside the jobs", () => {
  it("loss-prevention digest: a refused email doesn't stop the others, and what it carried alone goes again the next night", async () => {
    const owner = await db.user.create({ data: { name: "Olga Owner", role: "OWNER", companyId: w.owner.id, email: "olga@digest.example" } });
    const area = await db.user.create({ data: { name: "Ari Area", role: "AREA_MANAGER", regionId: w.region.id, email: "ari@digest.example" } });
    await db.alert.deleteMany();
    const alert = (key: string, userId: string | null) => ({ key, rule: "REFUND", severity: "MEDIUM" as const, storeId: w.store.id, userId, title: `Suspicious refund ${key}`, detail: "Refunded to a new card.", evidence: [] });
    // "everyone": both get it. "about-ari": only the owner (nobody is told about an alert about themselves).
    await db.alert.createMany({ data: [alert("everyone", null), alert("about-ari", area.id)] });
    const notified = async () => (await db.alert.findMany({ where: { notifiedAt: { not: null } }, select: { key: true }, orderBy: { key: "asc" } })).map((a) => a.key);

    mail.refuse.add(owner.email!);
    expect(await sendDigest()).toEqual({ emails: 1, failed: 1, alerts: 1 });
    expect(await notified()).toEqual(["everyone"]); // Ari has it; the owner's digest was the only one with "about-ari"
    mail.refuse.clear();
    expect(await sendDigest()).toEqual({ emails: 1, failed: 0, alerts: 1 });
    expect(await notified()).toEqual(["about-ari", "everyone"]);
  });

  it("campaigns: one that breaks doesn't hold back the next", async () => {
    const at = new Date("2026-10-06T10:00:00+02:00"); // a Tuesday morning, inside the CPA send window
    const base = { channel: "SMS" as const, message: "Hi {{firstName}}, new oils are in store this week.", status: "SCHEDULED" as const, scheduledAt: addDays(at, -1) };
    await db.campaign.create({ data: { ...base, name: "A segment that no longer exists", segment: "tier:PLATINUM_PLUS" } });
    const good = await db.campaign.create({ data: { ...base, name: "Everyone", segment: "ALL" } });
    expect(await runDueCampaigns(at)).toHaveLength(1);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: good.id } })).status).toBe("SENT");
  });

  it("trade statements: a missed statement day is made up within the week, a failed email goes again, a sent one never twice", async () => {
    const acc = await db.tradeAccount.create({
      data: { number: "TA-000901", name: "Corner Pharmacy", legalName: "Corner Pharmacy (Pty) Ltd", email: "accounts@corner.example", addressLine: "1 Main Rd", city: "Pretoria", province: "GP", postalCode: "0083", status: "APPROVED", terms: "ACCOUNT", creditLimitCents: 1_000_000, approvedAt: new Date() },
    });
    await db.tradeLedgerEntry.create({ data: { tradeAccountId: acc.id, kind: "ADJUSTMENT", cents: 12_345, note: "Opening balance" } });
    const december = (d: number) => new Date(`2026-12-0${d}T02:00:00+02:00`); // the statement day is the 1st: November's
    const id = statementLogId(acc.id, "2026-11");

    expect(await tradeStatements(december(3))).toMatchObject({ done: 1, failed: 0, month: "2026-11" }); // the 1st and 2nd were missed
    expect(await tradeStatements(december(4))).toMatchObject({ done: 0, month: "2026-11" });
    await db.messageLog.update({ where: { id }, data: { status: "FAILED", reason: "421 4.7.0 try again later" } });
    expect(await tradeStatements(december(5))).toMatchObject({ done: 1, month: "2026-11" });
    expect((await db.messageLog.findUniqueOrThrow({ where: { id } })).status).toBe("SENT");
    await db.messageLog.update({ where: { id }, data: { status: "FAILED" } });
    expect(await tradeStatements(december(8))).toMatchObject({ done: 0, skipped: "not the statement day" }); // the week is out
  });

  it("bank auto-match: an account that fails doesn't stop the others, and lines over 90 days old are left for a person", async () => {
    const owner = await db.user.findFirstOrThrow({ where: { email: "olga@digest.example" } });
    const fnb = await createBankAccount(w.owner.id, { bank: "FNB", name: "FNB Business", number: "62012345678" }, owner);
    const deposit = (id: string, date: string, cents: number) =>
      tx((t) => syncPosting(t, "test-deposit", id, w.owner.id, { companyId: w.owner.id, date, memo: `Deposit ${id}`, lines: [{ key: "bank", cents }, { key: "cash", cents: -cents }] }));
    const line = (companyId: string, date: string, cents: number, hash: string) =>
      db.bankLine.create({ data: { companyId, bankAccountId: fnb.id, date: new Date(`${date}T00:00:00Z`), amountCents: cents, description: `Deposit ${hash}`, hash } });
    await deposit("recent", daysAgo(3), 50_000);
    await deposit("old", daysAgo(100), 77_700);
    const recent = await line(w.owner.id, daysAgo(2), 50_000, "recent");
    const old = await line(w.owner.id, daysAgo(100), 77_700, "old");
    await line(w.hq.id, daysAgo(1), 1_000, "astray"); // filed under the wrong company: its account can't be matched

    expect(await autoMatchAll()).toEqual({ accounts: 2, matched: 1, failed: 1 });
    expect((await db.bankLine.findUniqueOrThrow({ where: { id: recent.id } })).status).toBe("MATCHED");
    expect((await db.bankLine.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("UNMATCHED");
    await db.bankLine.deleteMany({ where: { hash: "astray" } });
  });

  it("the books' first close waits a minute at most for the posting queue, and the month stays open while postings wait", async () => {
    await db.ledgerQueue.deleteMany();
    await queuePosting(db, "points", daysAgo(40));
    await expect(postQueueBeforeClose("2026-09", 0)).rejects.toThrow(
      "The books are still catching up (1 posting to go). What's left posts in the background every 15 minutes: close September 2026 once it's through, so nothing lands in a later month.",
    );
    await postQueueBeforeClose("2026-09");
    expect(await db.ledgerQueue.count()).toBe(0);
  });
});
