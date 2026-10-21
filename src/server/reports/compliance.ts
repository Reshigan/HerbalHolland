// Compliance reports: age checks, the SAHPRA dispensing register, blocked/flagged
// sales, recalls and batch traceability (every unit sold is linked to its batch).
import { db, Prisma } from "../db";
import { getSettings } from "../settings";
import { fmtDate } from "@/lib/format";
import type { Option, ParamArgs, ReportDef, Row } from "./types";
import { MANAGERS, PATIENT_DATA } from "./types";
import { CHANNEL_LABEL, bounds, multi, n, ratio, storeCols, storeLabel, storeVals, sumRows } from "./util";

const channelSql = (c?: "POS" | "ONLINE" | "WHOLESALE", col = "channel") => (c ? Prisma.sql`AND ${Prisma.raw(col)} = ${c}` : Prisma.empty);
/** A list of ids as one JSON parameter (any length under D1's 100 bound values): `col IN (${inList(ids)})`. */
const inList = (ids: readonly string[]) => Prisma.sql`SELECT value FROM json_each(${JSON.stringify(ids)})`;
/** `col IN (…)` for a short, fixed list of classes; an empty list matches nothing. */
const inSet = (xs: readonly string[]) => (xs.length ? Prisma.sql`IN (${Prisma.join(xs)})` : Prisma.sql`IN (NULL)`);

// ── Age checks ──────────────────────────────────────────────────────────────
const METHODS = [
  { key: "VERIFIED", label: "Verified", how: "Checked live against Home Affairs or a verification provider", tone: "green" },
  { key: "ID_SIGHTED", label: "ID sighted", how: "Staff inspected an ID document at the counter or handover", tone: "green" },
  { key: "ID_NUMBER", label: "ID number validated", how: "SA ID number format and check digit validated at sign-up", tone: "amber" },
  { key: "NONE", label: "No check", how: "Only allowed when nothing in the basket is age-restricted", tone: "neutral" },
] as const;

export const ageChecks: ReportDef = {
  key: "age-checks",
  title: "Age checks",
  description: "How was each buyer's age confirmed, and did any restricted sale slip through?",
  group: "Compliance",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const { compliance } = await getSettings();
    const restricted = compliance.ageRestricted;
    const data = await db.$queryRaw<{ method: string; storeId: string; n: number; gross: number; restricted: number }[]>`
      SELECT s."ageCheck" AS method, s."storeId", cast(COUNT(*) AS real) AS n, cast(COALESCE(SUM(s."totalCents"), 0) AS real) AS gross,
        cast(COUNT(CASE WHEN EXISTS (
          SELECT 1 FROM "SaleLine" l JOIN "Variant" v ON v.id = l."variantId" JOIN "Product" p ON p.id = v."productId"
          WHERE l."saleId" = s.id AND p."regClass" ${inSet(restricted)}
        ) THEN 1 END) AS real) AS restricted
      FROM "Sale" s
      WHERE s.kind = 'SALE' AND s."storeId" IN (${inList(ctx.storeIds)}) AND s."createdAt" >= ${start} AND s."createdAt" < ${end} ${channelSql(ctx.channel, "s.channel")}
      GROUP BY 1, 2`;
    const total = data.reduce((s, d) => s + d.n, 0);
    const restrictedTotal = data.reduce((s, d) => s + d.restricted, 0);
    const rows: Row[] = METHODS.map((m) => {
      const ds = data.filter((d) => d.method === m.key);
      const n = ds.reduce((s, d) => s + d.n, 0);
      const r = ds.reduce((s, d) => s + d.restricted, 0);
      return { method: m.label, how: m.how, n, share: ratio(n, total), restricted: r, restrictedShare: ratio(r, restrictedTotal), gross: ds.reduce((s, d) => s + d.gross, 0) };
    });
    const exceptions = data.filter((d) => d.method === "NONE" && d.restricted > 0);
    const strong = data.filter((d) => d.method === "VERIFIED" || d.method === "ID_SIGHTED").reduce((s, d) => s + d.restricted, 0);
    const missed = exceptions.reduce((s, d) => s + d.restricted, 0);
    return {
      columns: [
        { key: "method", label: "Method" },
        { key: "how", label: "How it works" },
        { key: "n", label: "Transactions", format: "number" },
        { key: "share", label: "Share", format: "pct" },
        { key: "restricted", label: "Age-restricted sales", format: "number" },
        { key: "restrictedShare", label: "Share of restricted", format: "pct" },
        { key: "gross", label: "Sales incl VAT", format: "zar" },
      ],
      rows,
      totals: { method: "Total", ...sumRows(rows, ["n", "restricted", "gross"]), share: total ? 1 : null, restrictedShare: restrictedTotal ? 1 : null },
      summary: [
        { label: "Age-restricted sales", value: restrictedTotal, format: "number", sub: `of ${n(total)} transactions` },
        { label: "Verified or ID sighted", value: ratio(strong, restrictedTotal), format: "pct", sub: "of age-restricted sales" },
        { label: "Restricted sales with no check", value: missed, format: "number", sub: missed ? "investigate (see below)" : "none: every restricted sale was checked", upIsGood: false },
      ],
      chart: total ? { kind: "donut", title: "How age was confirmed", description: "Share of transactions", format: "number", data: rows.map((r) => ({ label: String(r.method), value: r.n as number })), center: total.toLocaleString() } : null,
      extra: exceptions.length
        ? [{ title: "Restricted sales without an age check", description: "Usually offline sales posted after the till lost its connection", columns: [{ key: "store", label: "Store" }, { key: "n", label: "Sales", format: "number" }], rows: exceptions.map((e) => ({ store: storeLabel(ctx, e.storeId), n: e.restricted })) }]
        : [],
      empty: "No sales in this period.",
      note: `Age-restricted classes (from HQ compliance settings): ${restricted.join(", ")}; minimum age ${compliance.minAge}. "ID number validated" only proves the number is well-formed: ID sighted or live verification is stronger evidence.`,
    };
  },
};

// ── Dispensing register ─────────────────────────────────────────────────────
export const dispensingRegister: ReportDef = {
  key: "dispensing-register",
  title: "Dispensing register",
  description: "Every licensed (THC) sale with the patient's authorisation, prescriber, batch and dispenser.",
  group: "Compliance",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  defaultRange: "7d",
  roles: PATIENT_DATA,
  personal: true,
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const { compliance } = await getSettings();
    const licensed = compliance.licensedOnly;
    const from = Prisma.sql`FROM "SaleLine" l JOIN "Sale" s ON s.id = l."saleId" JOIN "Variant" v ON v.id = l."variantId" JOIN "Product" p ON p.id = v."productId"`;
    const where = Prisma.sql`
      WHERE s."storeId" IN (${inList(ctx.storeIds)}) AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
        AND p."regClass" ${inSet(licensed)} ${channelSql(ctx.channel, "s.channel")}`;
    const [lines, agg] = await Promise.all([
      // pa: the authorisation covering the sale (an active one first, then the latest to expire), picked by a correlated subquery.
      db.$queryRaw<{ at: Date; number: string; kind: string; storeId: string; channel: string; memberNo: string | null; firstName: string | null; lastName: string | null; authNumber: string | null; prescriber: string | null; prescriberRegNo: string | null; product: string; sku: string; qty: number; grams: number | null; dispenser: string | null; canDispense: boolean | number | null; batches: string | null }[]>`
        SELECT s."createdAt" AS at, s.number, s.kind AS kind, s."storeId", s.channel AS channel,
          c."memberNo", c."firstName", c."lastName", pa."authNumber", pa.prescriber, pa."prescriberRegNo",
          p.name || ' · ' || v.name AS product, v.sku, l.qty, v.grams * l.qty AS grams, u.name AS dispenser, u."canDispense",
          (SELECT group_concat(b.code || ' ×' || json_extract(a.value, '$.qty'), ', ') FROM json_each(l.allocations) a JOIN "Batch" b ON b.id = json_extract(a.value, '$.batchId')) AS batches
        ${from}
        LEFT JOIN "Customer" c ON c.id = s."customerId"
        LEFT JOIN "User" u ON u.id = s."staffId"
        LEFT JOIN "PatientAuth" pa ON pa.id = (
          SELECT x.id FROM "PatientAuth" x
          WHERE x."customerId" = s."customerId" AND x."validFrom" <= s."createdAt" AND x."validTo" >= s."createdAt"
          ORDER BY (x.status = 'ACTIVE') DESC, x."validTo" DESC LIMIT 1
        )
        ${where}
        ORDER BY s."createdAt" DESC
        LIMIT ${ctx.rowLimit}`,
      db.$queryRaw<{ n: number; units: number; grams: number; patients: number; sales: number; noAuth: number; noDispenser: number }[]>`
        SELECT cast(COUNT(*) AS real) AS n, cast(COALESCE(SUM(l.qty), 0) AS real) AS units, cast(COALESCE(SUM(l.qty * COALESCE(v.grams, 0)), 0) AS real) AS grams,
          cast(COUNT(DISTINCT s."customerId") AS real) AS patients, cast(COUNT(DISTINCT s.id) AS real) AS sales,
          cast(COUNT(CASE WHEN s.kind = 'SALE' AND NOT EXISTS (
            SELECT 1 FROM "PatientAuth" x WHERE x."customerId" = s."customerId" AND x."validFrom" <= s."createdAt" AND x."validTo" >= s."createdAt"
          ) THEN 1 END) AS real) AS "noAuth",
          cast(COUNT(CASE WHEN s.kind = 'SALE' AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = s."staffId" AND u."canDispense") THEN 1 END) AS real) AS "noDispenser"
        ${from} ${where}`,
    ]);
    const rows: Row[] = lines.map((x) => {
      const issues = x.kind === "SALE" ? [!x.authNumber && "No valid authorisation", (x.canDispense != null && !x.canDispense) || !x.dispenser ? "Not an authorised dispenser" : null].filter(Boolean) : [];
      return {
        at: x.at, ...storeVals(ctx, x.storeId), number: x.number, type: x.kind === "REFUND" ? "Return" : CHANNEL_LABEL[x.channel] ?? x.channel,
        who: `${x.firstName ? `${x.firstName} ${x.lastName ?? ""}`.trim() : "Unknown"}${x.memberNo ? ` · ${x.memberNo}` : ""}`,
        patient: x.memberNo ?? "—", name: x.firstName ? `${x.firstName} ${x.lastName ?? ""}`.trim() : "", auth: x.authNumber ?? "",
        prescriber: x.prescriber ? `${x.prescriber} (${x.prescriberRegNo})` : "", product: x.product, batches: x.batches ?? "",
        authorisation: x.authNumber ? `${x.authNumber} · ${x.prescriber} (${x.prescriberRegNo})` : "None on file",
        qty: x.qty, grams: x.grams == null ? null : Math.round(x.grams * 10) / 10, dispenser: x.dispenser ?? "", check: issues.length ? issues.join("; ") : "OK",
      };
    });
    const a = agg[0] ?? { n: 0, units: 0, grams: 0, patients: 0, sales: 0, noAuth: 0, noDispenser: 0 };
    const exceptions = a.noAuth + a.noDispenser;
    return {
      columns: [
        { key: "at", label: "Dispensed", format: "datetime" },
        ...storeCols(ctx),
        { key: "who", label: "Patient" },
        { key: "patient", label: "Patient no.", csvOnly: true },
        { key: "name", label: "Patient name", csvOnly: true },
        { key: "product", label: "Product" },
        { key: "qty", label: "Qty", format: "number" },
        { key: "grams", label: "Grams", format: "number" },
        { key: "batches", label: "Batch" },
        { key: "authorisation", label: "Authorisation · prescriber" },
        { key: "auth", label: "Authorisation", csvOnly: true },
        { key: "prescriber", label: "Prescriber (HPCSA)", csvOnly: true },
        { key: "dispenser", label: "Dispensed by" },
        { key: "check", label: "Check", format: "badge", tones: { OK: "green" } },
        { key: "number", label: "Sale" },
        { key: "type", label: "Type", csvOnly: true },
      ],
      rows,
      totalRows: a.n,
      totals: { at: "Total", qty: a.units, grams: Math.round(a.grams * 10) / 10 },
      summary: [
        { label: "Licensed sales", value: a.sales, format: "number", sub: `${n(a.n)} lines` },
        { label: "Patients", value: a.patients, format: "number" },
        { label: "Dispensed", value: `${n(Math.round(a.grams * 10) / 10)} g`, sub: `${n(a.units)} units` },
        { label: "Exceptions", value: exceptions, format: "number", sub: exceptions ? `${n(a.noAuth)} without authorisation · ${n(a.noDispenser)} without a dispenser` : "every sale authorised and dispensed", upIsGood: false },
      ],
      emptyTitle: "Nothing dispensed",
      empty: "No licensed products were dispensed in this period.",
      note: "Contains health-related personal information (POPIA s26): view and export it only for SAHPRA record-keeping and inspections. Exports are logged. The authorisation shown is the one valid at the time of sale. Clinical conditions are never stored.",
    };
  },
};

// ── Compliance events ───────────────────────────────────────────────────────
const EVENT_LABEL: Record<string, string> = {
  "compliance.block": "Sale blocked",
  "compliance.offline_exception": "Offline sale with exceptions",
};
const ruleOf = (msg: string) => msg.replace(/\d+(\.\d+)?\s*g\b/g, "Xg").split(/[:(]/)[0].trim();

export const complianceEvents: ReportDef = {
  key: "compliance-events",
  title: "Compliance events",
  description: "What did the compliance engine block or flag, where and why?",
  group: "Compliance",
  scopes: ["store", "hq"],
  filters: ["range"],
  roles: MANAGERS,
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const where: Prisma.AuditLogWhereInput = {
      action: { startsWith: "compliance." }, at: { gte: start, lt: end },
      OR: [{ storeId: { in: ctx.storeIds } }, ...(ctx.networkWide ? [{ storeId: null }] : [])],
    };
    const [list, count, all] = await Promise.all([
      db.auditLog.findMany({ where, orderBy: { at: "desc" }, take: ctx.rowLimit }),
      db.auditLog.count({ where }),
      db.auditLog.findMany({ where, select: { action: true, storeId: true, data: true }, take: 20_000 }),
    ]);
    const detail = (data: unknown) => {
      const d = (data ?? {}) as { blocks?: string[]; reason?: string; message?: string };
      return d.blocks?.join("; ") ?? d.reason ?? d.message ?? "";
    };
    const rules = new Map<string, number>();
    for (const e of all) for (const b of ((e.data as { blocks?: string[] } | null)?.blocks ?? [detail(e.data) || EVENT_LABEL[e.action] || e.action])) rules.set(ruleOf(b), (rules.get(ruleOf(b)) ?? 0) + 1);
    const rows: Row[] = list.map((e) => ({
      at: e.at, ...storeVals(ctx, e.storeId), event: EVENT_LABEL[e.action] ?? e.action.replace("compliance.", "").replaceAll("_", " "),
      detail: detail(e.data), actor: e.actorName ?? "", ref: e.entity ? `${e.entity}${e.entityId ? ` ${e.entityId.slice(0, 8)}` : ""}` : "",
    }));
    const stores = new Set(all.map((e) => e.storeId).filter(Boolean)).size;
    const top = [...rules].sort((a, b) => b[1] - a[1]);
    return {
      columns: [
        { key: "at", label: "When", format: "datetime" },
        ...storeCols(ctx),
        { key: "event", label: "Event" },
        { key: "detail", label: "Detail" },
        { key: "actor", label: "Staff" },
        { key: "ref", label: "Reference" },
      ],
      rows,
      totalRows: count,
      summary: [
        { label: "Events", value: count, format: "number" },
        { label: "Sales blocked", value: all.filter((e) => e.action === "compliance.block").length, format: "number" },
        { label: "Offline exceptions", value: all.filter((e) => e.action === "compliance.offline_exception").length, format: "number", upIsGood: false },
        ...(multi(ctx) ? [{ label: "Stores with events", value: stores, format: "number" as const }] : []),
      ],
      chart: top.length ? { kind: "bar", title: "Events by rule", description: "What the compliance engine caught", format: "number", rows: top.slice(0, 8).map(([label, value]) => ({ label, value })) } : null,
      emptyTitle: "No compliance events",
      empty: "Nothing was blocked or flagged in this period.",
      note: "A block means the till or checkout refused the sale until the rule was met (age, patient authorisation, monthly quantity, dispenser, licence). Offline exceptions are sales a disconnected till posted anyway, and each needs a manager's follow-up.",
    };
  },
};

// ── Recalls ─────────────────────────────────────────────────────────────────
export const recalls: ReportDef = {
  key: "recalls",
  title: "Recalls & quarantine",
  description: "Recalled or quarantined batches: what was sold, who has it, and what is still on the shelf.",
  group: "Compliance",
  scopes: ["store", "hq"],
  async run(ctx) {
    const batches = await db.batch.findMany({
      where: { status: { in: ["RECALLED", "QUARANTINE"] } },
      include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    const ids = batches.map((b) => b.id);
    const [moves, held, since] = ids.length
      ? await Promise.all([
          db.$queryRaw<{ batchId: string; sold: number; returned: number; members: number; walkIn: number }[]>`
            SELECT m."batchId",
              cast(COALESCE(-SUM(CASE WHEN m.type IN ('SALE', 'ONLINE') THEN m.qty ELSE 0 END), 0) AS real) AS sold,
              cast(COALESCE(SUM(CASE WHEN m.type = 'REFUND' THEN m.qty ELSE 0 END), 0) AS real) AS returned,
              cast(COUNT(DISTINCT CASE WHEN m.type IN ('SALE', 'ONLINE') THEN s."customerId" END) AS real) AS members,
              cast(COALESCE(-SUM(CASE WHEN m.type IN ('SALE', 'ONLINE') AND s."customerId" IS NULL THEN m.qty ELSE 0 END), 0) AS real) AS "walkIn"
            FROM "StockMovement" m LEFT JOIN "Sale" s ON s.id = m."saleId"
            WHERE m."batchId" IN (${inList(ids)}) AND m."storeId" IN (${inList(ctx.storeIds)})
            GROUP BY 1`,
          db.$queryRaw<{ batchId: string; units: number; stores: number }[]>`
            SELECT "batchId", cast(SUM("onHand") AS real) AS units, cast(COUNT(DISTINCT "storeId") AS real) AS stores
            FROM "StockLevel" WHERE "batchId" IN (${inList(ids)}) AND "storeId" IN (${inList(ctx.storeIds)}) AND "onHand" > 0
            GROUP BY 1`,
          db.auditLog.findMany({ where: { entity: "Batch", entityId: { in: ids }, action: { in: ["batch.recall", "batch.quarantine", "batch.status"] } }, select: { entityId: true, at: true }, orderBy: { at: "desc" } }),
        ])
      : [[], [], []];
    const m = new Map(moves.map((x) => [x.batchId, x]));
    const h = new Map(held.map((x) => [x.batchId, x]));
    const s = new Map<string, Date>();
    for (const a of since) if (a.entityId && !s.has(a.entityId)) s.set(a.entityId, a.at);
    const rows: Row[] = batches.map((b) => {
      const x = m.get(b.id) ?? { sold: 0, returned: 0, members: 0, walkIn: 0 };
      const y = h.get(b.id) ?? { units: 0, stores: 0 };
      return {
        batch: b.code, product: `${b.variant.product.name} · ${b.variant.name}`, status: b.status === "RECALLED" ? "Recalled" : "Quarantine", reason: b.statusReason ?? "",
        since: s.get(b.id) ?? null, sold: x.sold, returned: x.returned, out: x.sold - x.returned, members: x.members, walkIn: x.walkIn, onHand: y.units, stores: y.stores,
        _href: ctx.href("batch-trace", { batch: b.id }),
      };
    });
    const t = sumRows(rows, ["sold", "returned", "out", "members", "walkIn", "onHand"], { batch: "Total" });
    return {
      columns: [
        { key: "batch", label: "Batch" },
        { key: "product", label: "Product" },
        { key: "status", label: "Status", format: "badge", tones: { Recalled: "red", Quarantine: "amber" } },
        { key: "reason", label: "Reason" },
        { key: "since", label: "Since", format: "date" },
        { key: "sold", label: "Units sold", format: "number" },
        { key: "returned", label: "Returned", format: "number", csvOnly: true },
        { key: "out", label: "With members", format: "number" },
        { key: "members", label: "Members affected", format: "number" },
        { key: "walkIn", label: "Walk-in units", format: "number" },
        { key: "onHand", label: "Still on hand", format: "number" },
        { key: "stores", label: "Stores holding", format: "number" },
      ],
      rows,
      totals: t,
      summary: [
        { label: "Batches blocked", value: rows.length, format: "number", sub: `${n(rows.filter((r) => r.status === "Recalled").length)} recalled · ${n(rows.filter((r) => r.status === "Quarantine").length)} in quarantine` },
        { label: "Units with members", value: t.out as number, format: "number", upIsGood: false },
        { label: "Members to contact", value: t.members as number, format: "number", sub: `${n(t.walkIn as number)} walk-in units untraceable` },
        { label: "Still on hand", value: t.onHand as number, format: "number", sub: "must be pulled from sale", upIsGood: false },
      ],
      emptyTitle: "No recalls",
      empty: "No batches are recalled or in quarantine.",
      note: "The till and web shop never sell a recalled or quarantined batch. Pull any units still on hand, log returns as RECALL adjustments and open a batch to trace its members.",
    };
  },
};

// ── Batch trace ─────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = { RECALLED: "Recalled", QUARANTINE: "Quarantined", RELEASED: "Released" };

async function batchOptions({ storeIds }: ParamArgs): Promise<Option[]> {
  const rows = await db.$queryRaw<{ id: string; code: string; status: string; product: string; variant: string }[]>`
    SELECT b.id, b.code, b.status AS status, p.name AS product, v.name AS variant
    FROM "Batch" b JOIN "Variant" v ON v.id = b."variantId" JOIN "Product" p ON p.id = v."productId"
    WHERE EXISTS (SELECT 1 FROM "StockLevel" sl WHERE sl."batchId" = b.id AND sl."storeId" IN (${inList(storeIds)}))
    ORDER BY CASE b.status WHEN 'RECALLED' THEN 0 WHEN 'QUARANTINE' THEN 1 ELSE 2 END, p.name, v.name, b.code`;
  return [{ value: "", label: "Choose a batch…" }, ...rows.map((r) => ({ value: r.id, label: `${r.code}: ${r.product} · ${r.variant}`, group: STATUS_LABEL[r.status] ?? r.status }))];
}

export const batchTrace: ReportDef = {
  key: "batch-trace",
  title: "Batch trace",
  description: "Pick a batch: which stores hold it and which members bought it.",
  group: "Compliance",
  scopes: ["store", "hq"],
  roles: MANAGERS,
  personal: true,
  params: [{ key: "batch", label: "Batch", options: batchOptions, default: ({ options }) => options.find((o) => o.value && o.group !== "Released")?.value ?? "" }],
  async run(ctx) {
    const id = ctx.params.batch;
    const columns = [
      { key: "at", label: "When", format: "datetime" as const },
      ...storeCols(ctx),
      { key: "name", label: "Customer" },
      { key: "member", label: "Member no." },
      { key: "phone", label: "Phone" },
      { key: "units", label: "Units", format: "number" as const },
      { key: "type", label: "Type" },
      { key: "number", label: "Sale" },
      { key: "email", label: "Email" },
    ];
    if (!id) return { columns, rows: [], emptyTitle: "Choose a batch", empty: "Pick a batch above to see where it went and who bought it." };
    const saleIds = Prisma.sql`SELECT DISTINCT "saleId" FROM "StockMovement" WHERE "batchId" = ${id} AND "saleId" IS NOT NULL AND "storeId" IN (${inList(ctx.storeIds)})`;
    const [batch, held, received, sales, agg] = await Promise.all([
      db.batch.findUnique({ where: { id }, include: { variant: { select: { name: true, product: { select: { name: true } } } } } }),
      db.stockLevel.findMany({ where: { batchId: id, storeId: { in: ctx.storeIds } }, select: { storeId: true, onHand: true, updatedAt: true } }),
      db.stockMovement.groupBy({ by: ["storeId"], where: { batchId: id, storeId: { in: ctx.storeIds }, type: { in: ["RECEIVE", "TRANSFER_IN"] } }, _sum: { qty: true } }),
      db.$queryRaw<{ at: Date; number: string; kind: string; storeId: string; channel: string; memberNo: string | null; firstName: string | null; lastName: string | null; phone: string | null; email: string | null; units: number }[]>`
        SELECT s."createdAt" AS at, s.number, s.kind AS kind, s."storeId", s.channel AS channel,
          c."memberNo", c."firstName", c."lastName", c.phone, c.email, cast(SUM(cast(json_extract(a.value, '$.qty') AS integer)) AS real) AS units
        FROM "Sale" s
        JOIN "SaleLine" l ON l."saleId" = s.id
        CROSS JOIN json_each(l.allocations) a
        LEFT JOIN "Customer" c ON c.id = s."customerId"
        WHERE s.id IN (${saleIds}) AND json_extract(a.value, '$.batchId') = ${id}
        GROUP BY s.id, c.id
        ORDER BY s."createdAt" DESC
        LIMIT ${ctx.rowLimit}`,
      db.$queryRaw<{ lines: number; sold: number; returned: number; members: number; walkIn: number }[]>`
        SELECT cast(COUNT(DISTINCT s.id) AS real) AS lines,
          cast(COALESCE(SUM(CASE WHEN s.kind = 'SALE' THEN cast(json_extract(a.value, '$.qty') AS integer) ELSE 0 END), 0) AS real) AS sold,
          cast(COALESCE(SUM(CASE WHEN s.kind = 'REFUND' THEN cast(json_extract(a.value, '$.qty') AS integer) ELSE 0 END), 0) AS real) AS returned,
          cast(COUNT(DISTINCT CASE WHEN s.kind = 'SALE' THEN s."customerId" END) AS real) AS members,
          cast(COALESCE(SUM(CASE WHEN s.kind = 'SALE' AND s."customerId" IS NULL THEN cast(json_extract(a.value, '$.qty') AS integer) ELSE 0 END), 0) AS real) AS "walkIn"
        FROM "Sale" s JOIN "SaleLine" l ON l."saleId" = s.id CROSS JOIN json_each(l.allocations) a
        WHERE s.id IN (${saleIds}) AND json_extract(a.value, '$.batchId') = ${id}`,
    ]);
    if (!batch) return { columns, rows: [], emptyTitle: "Batch not found", empty: "That batch no longer exists." };
    const rec = new Map(received.map((r) => [r.storeId, r._sum.qty ?? 0]));
    const a = agg[0] ?? { lines: 0, sold: 0, returned: 0, members: 0, walkIn: 0 };
    const rows: Row[] = sales.map((x) => ({
      at: x.at, number: x.number, ...storeVals(ctx, x.storeId), type: x.kind === "REFUND" ? "Returned" : CHANNEL_LABEL[x.channel] ?? x.channel,
      member: x.memberNo ?? "", name: x.firstName ? `${x.firstName} ${x.lastName ?? ""}`.trim() : "Walk-in (not a member)", phone: x.phone ?? "", email: x.email ?? "",
      units: x.kind === "REFUND" ? -x.units : x.units,
    }));
    const where = [...new Set([...held.map((x) => x.storeId), ...rec.keys()])]
      .map((sid) => ({ store: storeLabel(ctx, sid), code: ctx.stores.get(sid)?.code ?? "", received: rec.get(sid) ?? 0, onHand: held.find((x) => x.storeId === sid)?.onHand ?? 0, updated: held.find((x) => x.storeId === sid)?.updatedAt ?? null }))
      .sort((x, y) => y.onHand - x.onHand || y.received - x.received);
    const onHand = where.reduce((s, w) => s + Math.max(0, w.onHand), 0);
    return {
      title: `${batch.code}: ${batch.variant.product.name} · ${batch.variant.name}`,
      columns,
      rows,
      totalRows: a.lines,
      totals: { at: "Total", units: a.sold - a.returned },
      summary: [
        { label: "Status", value: STATUS_LABEL[batch.status] ?? batch.status, sub: batch.statusReason ?? `Packed ${fmtDate(batch.packedAt)}${batch.expiresAt ? ` · expires ${fmtDate(batch.expiresAt)}` : ""}` },
        { label: "Units sold", value: a.sold, format: "number", sub: `${n(a.returned)} returned` },
        { label: "Members to contact", value: a.members, format: "number", sub: `${n(a.walkIn)} walk-in units can't be traced` },
        { label: "Still on hand", value: onHand, format: "number", sub: `at ${n(where.filter((w) => w.onHand > 0).length)} location${where.filter((w) => w.onHand > 0).length === 1 ? "" : "s"}` },
      ],
      extra: [
        {
          title: "Where it is now",
          description: `Supplier ${batch.supplier}${batch.labName ? ` · tested by ${batch.labName}` : ""}${batch.coaRef ? ` · COA ${batch.coaRef}` : ""}`,
          columns: [{ key: "store", label: "Location" }, { key: "code", label: "Code" }, { key: "received", label: "Received", format: "number" }, { key: "onHand", label: "On hand now", format: "number" }, { key: "updated", label: "Last change", format: "datetime" }],
          rows: where,
          totals: { store: "Total", received: where.reduce((s, w) => s + w.received, 0), onHand },
        },
      ],
      emptyTitle: "No sales of this batch",
      empty: "None of it has been sold in the stores you can see.",
      note: "Traced from each sale line's batch allocation. Contact details are personal information (POPIA): use them only to manage this batch. Exports are logged.",
    };
  },
};
