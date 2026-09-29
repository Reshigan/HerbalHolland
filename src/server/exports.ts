// Scheduled report exports ("Email me this weekly/monthly"): the daily job re-runs each due report as the person who
// scheduled it (their scope, their filters), stores the CSV and emails the staff recipients a signed download link —
// never the file itself. Links are HMAC-signed like invoice links and expire after 30 days.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { audit, SYSTEM, type Actor } from "./audit";
import { emailLayout, esc, sendEmail } from "./email";
import { APP_URL } from "./invoices";
import { canRun, getReport } from "./reports";
import { storeForUser } from "./scope";
import { reportContext } from "./reports/context";
import { putObject } from "./storage";
import { csvFilename, toCsv } from "@/lib/csv";
import { addDays, dayKey, fmtDate, weekdaySA } from "@/lib/format";
import type { Staff } from "./auth";
import type { ExportCadence, ScheduledExport } from "@/generated/prisma/client";

export class ExportError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

export const LINK_DAYS = 30;
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ── Signed download links ────────────────────────────────────────────────────
const sign = (uploadId: string, exp: number) => createHmac("sha256", process.env.SESSION_SECRET ?? "dev").update(`export:${uploadId}:${exp}`).digest("base64url").slice(0, 32);

/** `exp` is a unix day (days since 1970). */
export function exportUrl(uploadId: string, now = new Date()) {
  const exp = Math.floor(now.getTime() / 86_400_000) + LINK_DAYS;
  return `${APP_URL()}/api/exports/${uploadId}?e=${exp}&t=${sign(uploadId, exp)}`;
}

export function verifyExportToken(uploadId: string, exp: string | null, token: string | null, now = new Date()) {
  const e = Number(exp);
  if (!Number.isInteger(e) || !token) return false;
  if (e < Math.floor(now.getTime() / 86_400_000)) return false;
  const want = Buffer.from(sign(uploadId, e));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ── Schedules ────────────────────────────────────────────────────────────────
export type ScheduleInput = {
  reportKey: string;
  params: Record<string, string>; // scope ("hq" | "store"), store code and the report's query
  cadence: ExportCadence;
  dayOfWeek?: number | null; // 1 = Monday … 7 = Sunday
  dayOfMonth?: number | null; // 1–28
  recipients: string[];
};

/** Recipients must be active staff with that email — reports are for the team, never for outside addresses. */
export async function validateRecipients(raw: string[]) {
  const emails = [...new Set(raw.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) throw new ExportError("Add at least one recipient", "recipients");
  if (emails.length > 10) throw new ExportError("Up to 10 recipients", "recipients");
  const users = await db.user.findMany({ where: { active: true, email: { in: emails } }, select: { email: true } });
  const known = new Set(users.map((u) => u.email!.toLowerCase()));
  const unknown = emails.filter((e) => !known.has(e));
  if (unknown.length) throw new ExportError(`Only staff email addresses: ${unknown.join(", ")} ${unknown.length === 1 ? "isn't" : "aren't"} on the team`, "recipients");
  return emails;
}

export async function createSchedule(user: Staff, a: ScheduleInput, actor: Actor) {
  const def = getReport(a.reportKey);
  if (!def) throw new ExportError("Unknown report");
  if (!canRun(def, user.role)) throw new ExportError("You can't run this report");
  const scope = a.params.scope === "store" ? "store" : "hq";
  if (!def.scopes.includes(scope)) throw new ExportError("This report isn't available in that scope");
  if (a.cadence === "WEEKLY" && !(a.dayOfWeek && a.dayOfWeek >= 1 && a.dayOfWeek <= 7)) throw new ExportError("Choose a weekday", "day");
  if (a.cadence === "MONTHLY" && !(a.dayOfMonth && a.dayOfMonth >= 1 && a.dayOfMonth <= 28)) throw new ExportError("Choose a day of the month (1–28)", "day");
  const recipients = await validateRecipients(a.recipients);
  if ((await db.scheduledExport.count({ where: { userId: user.id, active: true } })) >= 20) throw new ExportError("You already have 20 scheduled exports — stop one first");
  const params: Record<string, string> = { scope };
  for (const [k, v] of Object.entries(a.params)) if (v && ["store", "stores", "range", "from", "to", "category", "channel", "month"].includes(k)) params[k] = String(v).slice(0, 40);
  for (const p of def.params ?? []) if (a.params[p.key]) params[p.key] = String(a.params[p.key]).slice(0, 40);
  const s = await db.scheduledExport.create({
    data: { userId: user.id, reportKey: def.key, params, cadence: a.cadence, dayOfWeek: a.cadence === "WEEKLY" ? a.dayOfWeek : null, dayOfMonth: a.cadence === "MONTHLY" ? a.dayOfMonth : null, recipients },
  });
  await audit(db, actor, "export.schedule", { entity: "ScheduledExport", entityId: s.id, data: { reportKey: def.key, cadence: a.cadence, params, recipients } });
  return s;
}

export async function stopSchedule(user: Staff, id: string, actor: Actor) {
  const s = await db.scheduledExport.findFirst({ where: { id, userId: user.id, active: true } });
  if (!s) throw new ExportError("Schedule not found");
  await db.scheduledExport.update({ where: { id }, data: { active: false } });
  await audit(db, actor, "export.unschedule", { entity: "ScheduledExport", entityId: id, data: { reportKey: s.reportKey } });
  return s;
}

export const mySchedules = (userId: string, reportKey: string) => db.scheduledExport.findMany({ where: { userId, reportKey, active: true }, orderBy: { createdAt: "asc" } });

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export function scheduleLabel(s: { cadence: ExportCadence; dayOfWeek: number | null; dayOfMonth: number | null }) {
  return s.cadence === "WEEKLY" ? `Weekly on ${WEEKDAYS[(s.dayOfWeek ?? 1) - 1]}` : `Monthly on the ${ordinal(s.dayOfMonth ?? 1)}`;
}

/** Due today (SAST) and not yet run today. */
export function isDue(s: { cadence: ExportCadence; dayOfWeek: number | null; dayOfMonth: number | null; lastRunAt: Date | null }, now = new Date()) {
  if (s.lastRunAt && dayKey(s.lastRunAt) === dayKey(now)) return false;
  if (s.cadence === "WEEKLY") return ((weekdaySA(now) + 6) % 7) + 1 === s.dayOfWeek; // 1 = Monday … 7 = Sunday
  return Number(dayKey(now).slice(8, 10)) === s.dayOfMonth;
}

// ── Running ──────────────────────────────────────────────────────────────────
type StoreArg = { id: string; code: string; name: string; companyId: string; company: { name: string } };

/** Renders one export as its owner: stores the CSV as an Upload and emails the link. Returns the upload id, or null. */
export async function runExport(s: ScheduledExport, now = new Date()) {
  const user = (await db.user.findUnique({ where: { id: s.userId }, include: { company: true, store: true, region: true } })) as Staff | null;
  const def = getReport(s.reportKey);
  if (!user?.active || !def || !canRun(def, user.role)) {
    await db.scheduledExport.update({ where: { id: s.id }, data: { active: false } });
    return null;
  }
  const params = (s.params ?? {}) as Record<string, string>;
  const scope = params.scope === "store" ? "store" : "hq";
  let store: StoreArg | undefined;
  if (scope === "store") {
    store = await storeForUser(user, params.store ?? "").catch(() => undefined);
    if (!store) {
      await db.scheduledExport.update({ where: { id: s.id }, data: { active: false } });
      return null;
    }
  }
  const r = await reportContext({ def, scope, user, store, sp: params, mode: "csv", basePath: scope === "hq" ? "/hq/reports" : `/store/${store!.code}/reports` });
  const result = await def.run(r.ctx);
  const csv = toCsv([
    { columns: result.columns, rows: result.rows, totals: result.totals },
    ...(result.extra ?? []).map((t) => ({ title: t.title, columns: t.columns, rows: t.rows, totals: t.totals })),
  ]);
  const where = scope === "hq" ? (r.query.stores ? r.query.stores.replace("region:", "") : "network") : store!.code;
  const period = r.controls.range ? [r.ctx.range.from, r.ctx.range.to] : [r.ctx.params.month ?? dayKey(now)];
  const fileName = csvFilename("herbal-holland", def.key, where, ...period);
  const bytes = new TextEncoder().encode(csv) as Uint8Array<ArrayBuffer>;
  const key = `exports/${s.userId}/${dayKey(now)}/${s.id}.csv`;
  await putObject(key, bytes, "text/csv; charset=utf-8");
  const upload = await db.upload.create({
    data: { key, fileName, contentType: "text/csv", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), storeId: store?.id ?? null, uploadedById: s.userId },
  });
  const url = exportUrl(upload.id, now);
  const label = scheduleLabel(s).toLowerCase();
  const subject = `${def.title} · ${r.scopeLabel} · ${r.rangeLabel}`;
  const html = emailLayout({
    preheader: `Your ${label} export of ${def.title} is ready`,
    heading: def.title,
    body: `<p style="margin:0 0 12px;font-size:14px;line-height:21px">${esc(r.scopeLabel)} · ${esc(r.rangeLabel)}<br/>${result.rows.length.toLocaleString("en-US")} row${result.rows.length === 1 ? "" : "s"} · scheduled ${esc(label)} by ${esc(user.name)}</p>
<p style="margin:0;color:#6B5F57;font-size:13px">The link works for ${LINK_DAYS} days and needs no sign-in — don't forward it outside the team. To stop these emails, open the report and remove the schedule.</p>`,
    cta: { label: "Download CSV", href: url },
    footerHtml: "You received this because a colleague scheduled this report for you in the HQ console.",
  });
  const text = `${def.title}\n${r.scopeLabel} · ${r.rangeLabel}\n${result.rows.length} rows\n\nDownload (valid ${LINK_DAYS} days): ${url}`;
  for (const to of s.recipients) await sendEmail({ to, subject, html, text });
  await db.scheduledExport.update({ where: { id: s.id }, data: { lastRunAt: now } });
  await audit(db, SYSTEM, "report.export", {
    storeId: store?.id ?? null, entity: "Report", entityId: def.key,
    data: { scope, query: r.query, rows: result.rows.length, personal: !!def.personal, scheduled: s.id, by: user.id, recipients: s.recipients, uploadId: upload.id },
  });
  return upload.id;
}

/** The daily job: every active schedule due today. */
export async function runDueExports(now = new Date()) {
  const list = await db.scheduledExport.findMany({ where: { active: true }, take: 1_000 });
  let done = 0, failed = 0;
  for (const s of list.filter((x) => isDue(x, now))) {
    try {
      if (await runExport(s, now)) done++;
    } catch (e) {
      failed++;
      console.error("[exports]", s.id, e);
    }
  }
  return { done, failed };
}

/** Old export files are of no further use once their links have expired. */
export async function pruneExports(now = new Date()) {
  const { count } = await db.upload.deleteMany({ where: { key: { startsWith: "exports/" }, createdAt: { lt: addDays(now, -(LINK_DAYS + 7)) } } });
  return count;
}

export const fmtRun = (d: Date | null) => (d ? fmtDate(d) : "never");
