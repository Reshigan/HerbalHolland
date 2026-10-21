// Scheduled report exports ("Email me this weekly/monthly"): the daily job re-runs each due report as the person who
// scheduled it (their scope, their filters), stores the CSV and emails the staff recipients a signed download link,
// never the file itself. Recipients are colleagues whose role may run that report and who may see what it covers: a
// network-wide report goes to HQ admin and the HQ team only, a region's or a store's to people whose scope includes
// every store in it (checked again at every run and at download); the link is HMAC-signed, expires after 30 days,
// works only for them once signed in, and never appears in the message log.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { audit, SYSTEM, type Actor } from "./audit";
import { emailLayout, esc, sendEmail } from "./email";
import { APP_URL } from "./invoices";
import { canRun, getReport } from "./reports";
import { scopeOf, scopedStoreIds, storeForUser, storeWhere } from "./scope";
import { reportContext } from "./reports/context";
import { deleteObject, putObject } from "./storage";
import { csvFilename, toCsv } from "@/lib/csv";
import { addDays, dayKey, fmtDate, weekdaySA } from "@/lib/format";
import type { Staff } from "./auth";
import type { ExportCadence, Role, ScheduledExport } from "@/generated/prisma/client";
import type { ReportDef } from "./reports/types";
import { appSecret } from "./secret";
import { asList, inBatches } from "@/lib/json-list";

export class ExportError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

export const LINK_DAYS = 30;
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ── Signed download links ────────────────────────────────────────────────────
const sign = (uploadId: string, exp: number) => createHmac("sha256", appSecret()).update(`export:${uploadId}:${exp}`).digest("base64url").slice(0, 32);

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

// ── Who may receive what ─────────────────────────────────────────────────────
type Who = { role: Role; regionId: string | null; companyId: string | null; storeId: string | null };
const WHO = { email: true, role: true, regionId: true, companyId: true, storeId: true } as const;

/** What a schedule's CSV covers: the whole network, or these stores. */
export type Reach = { network: true } | { network: false; storeIds: string[] };

/** A schedule's reach: its owner's scope narrowed by its store filter, read as reports/context reads it. */
export async function scheduleReach(owner: Who, params: Record<string, string>): Promise<Reach> {
  const scope = scopeOf(owner);
  if (params.scope === "store") {
    const store = await db.store.findFirst({ where: { AND: [{ code: params.store ?? "" }, storeWhere(scope)] }, select: { id: true, companyId: true } });
    if (!store) return { network: false, storeIds: [] };
    const company = params.stores === "company" ? await scopedStoreIds(scope, { companyId: store.companyId, kind: "RETAIL" }) : [];
    return { network: false, storeIds: company.length > 1 ? company : [store.id] };
  }
  const v = params.stores ?? "";
  const narrowed = v ? await scopedStoreIds(scope, v.startsWith("region:") ? { region: { code: v.slice(7) } } : { code: v }) : [];
  if (narrowed.length) return { network: false, storeIds: narrowed };
  return scope.kind === "HQ" ? { network: true } : { network: false, storeIds: await scopedStoreIds(scope) };
}

/** Network-wide reports are for HQ admin and the HQ team; anything narrower for people who may see every store in it. */
export async function mayReceive(u: Who, reach: Reach) {
  if (reach.network) return u.role === "HQ_ADMIN" || u.role === "HQ_STAFF";
  const scope = scopeOf(u);
  if (scope.kind === "HQ") return true;
  const ids = [...new Set(reach.storeIds)];
  return ids.length > 0 && (await db.store.count({ where: { AND: [{ id: { in: ids } }, storeWhere(scope)] } })) === ids.length;
}

/**
 * Recipients must be active staff whose role may run the report and who may see what it covers (`reach`): never
 * outside addresses, never people the report or its stores are closed to.
 */
export async function validateRecipients(raw: string[], def: ReportDef, reach?: Reach) {
  const emails = [...new Set(raw.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) throw new ExportError("Add at least one recipient", "recipients");
  if (emails.length > 10) throw new ExportError("Up to 10 recipients", "recipients");
  const users = await db.user.findMany({ where: { active: true, email: { in: emails } }, select: WHO });
  const by = new Map(users.map((u) => [u.email!.toLowerCase(), u]));
  const unknown = emails.filter((e) => !by.has(e));
  if (unknown.length) throw new ExportError(`Only staff email addresses: ${unknown.join(", ")} ${unknown.length === 1 ? "isn't" : "aren't"} on the team`, "recipients");
  const barred = emails.filter((e) => !canRun(def, by.get(e)!.role));
  if (barred.length) throw new ExportError(`${barred.join(", ")} can't open this report, so can't receive it`, "recipients");
  if (reach) {
    const outside: string[] = [];
    for (const e of emails) if (!(await mayReceive(by.get(e)!, reach))) outside.push(e);
    if (outside.length)
      throw new ExportError(
        reach.network
          ? `A network-wide report goes to the HQ team only: ${outside.join(", ")} can't receive it`
          : `${outside.join(", ")} can't see every store in this report, so can't receive it`,
        "recipients",
      );
  }
  return emails;
}

/** Of a schedule's recipients, the ones who may still receive it: active, their role still runs the report, and it still covers only what they may see. */
async function currentRecipients(emails: string[], def: ReportDef, reach: Reach) {
  const users = await db.user.findMany({ where: { active: true, email: { in: emails } }, select: WHO });
  const to: string[] = [];
  for (const u of users) if (canRun(def, u.role) && (await mayReceive(u, reach))) to.push(u.email!.toLowerCase());
  return to;
}

/** The schedule an export file came from (its key is exports/<user>/<day>/<schedule>.csv). */
export const scheduleIdOf = (key: string) => /^exports\/[^/]+\/\d{4}-\d{2}-\d{2}\/([^/]+)\.csv$/.exec(key)?.[1] ?? null;

export async function createSchedule(user: Staff, a: ScheduleInput, actor: Actor) {
  const def = getReport(a.reportKey);
  if (!def) throw new ExportError("Unknown report");
  if (!canRun(def, user.role)) throw new ExportError("You can't run this report");
  const scope = a.params.scope === "store" ? "store" : "hq";
  if (!def.scopes.includes(scope)) throw new ExportError("This report isn't available in that scope");
  if (a.cadence === "WEEKLY" && !(a.dayOfWeek && a.dayOfWeek >= 1 && a.dayOfWeek <= 7)) throw new ExportError("Choose a weekday", "day");
  if (a.cadence === "MONTHLY" && !(a.dayOfMonth && a.dayOfMonth >= 1 && a.dayOfMonth <= 28)) throw new ExportError("Choose a day of the month (1–28)", "day");
  const params: Record<string, string> = { scope };
  for (const [k, v] of Object.entries(a.params)) if (v && ["store", "stores", "range", "from", "to", "category", "channel", "month"].includes(k)) params[k] = String(v).slice(0, 40);
  for (const p of def.params ?? []) if (a.params[p.key]) params[p.key] = String(a.params[p.key]).slice(0, 40);
  const recipients = await validateRecipients(a.recipients, def, await scheduleReach(user, params));
  if ((await db.scheduledExport.count({ where: { userId: user.id, active: true } })) >= 20) throw new ExportError("You already have 20 scheduled exports, so stop one first");
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
  const to = await currentRecipients(asList<string>(s.recipients), def, await scheduleReach(user, params));
  if (!to.length) {
    await db.scheduledExport.update({ where: { id: s.id }, data: { active: false } });
    return null;
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
<p style="margin:0;color:#6B5F57;font-size:13px">The link works for ${LINK_DAYS} days, for the colleagues it was sent to: sign in with your Herbal Holland login to download. To stop these emails, open the report and remove the schedule.</p>`,
    cta: { label: "Download CSV", href: url },
    footerHtml: "You received this because a colleague scheduled this report for you in the HQ console.",
  });
  const text = (link: string) => `${def.title}\n${r.scopeLabel} · ${r.rangeLabel}\n${result.rows.length} rows\n\nDownload (valid ${LINK_DAYS} days, sign in first): ${link}`;
  for (const addr of to) await sendEmail({ to: addr, subject, html, text: text(url), logText: text(`${APP_URL()}/api/exports/${upload.id} (signed link sent; not kept here)`) });
  await db.scheduledExport.update({ where: { id: s.id }, data: { lastRunAt: now } });
  await audit(db, SYSTEM, "report.export", {
    storeId: store?.id ?? null, entity: "Report", entityId: def.key,
    data: { scope, query: r.query, rows: result.rows.length, personal: !!def.personal, scheduled: s.id, by: user.id, recipients: to, uploadId: upload.id },
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
/** Export files past their links (plus a week): the stored CSVs and their rows both go. */
export async function pruneExports(now = new Date()) {
  const old = await db.upload.findMany({ where: { key: { startsWith: "exports/" }, createdAt: { lt: addDays(now, -(LINK_DAYS + 7)) } }, select: { id: true, key: true }, take: 2_000 });
  for (const f of old) await deleteObject(f.key).catch((e) => console.error("[exports] delete failed", f.key, e));
  return (await inBatches(old.map((f) => f.id), (part) => db.upload.deleteMany({ where: { id: { in: part } } }).then((r) => [r.count]))).reduce((s, n) => s + n, 0);
}

export const fmtRun = (d: Date | null) => (d ? fmtDate(d) : "never");
