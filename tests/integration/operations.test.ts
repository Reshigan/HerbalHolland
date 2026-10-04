// Operations: the manager's Today list, staff push events (logged without VAPID keys, never twice, never about
// yourself), supplier invoices (file checks, pay/query, audit), the opening checklist, scheduled exports (signed
// links) and the forecast-driven replenishment plan — against the real services and a disposable database.
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "hh-ops-"));

import { db } from "@/server/db";
import { placeOrder } from "@/server/orders";
import { postPosSale } from "@/server/sales";
import { quote } from "@/server/pricing";
import { raiseAlerts } from "@/server/loss";
import { todayFacts, todayList } from "@/server/today";
import { captureSupplierInvoice, invoicesForOrder, paySupplierInvoice, querySupplierInvoice, reopenSupplierInvoice, supplierInvoiceList, supplierInvoiceSummary, supplierInvoicesByStore } from "@/server/supplier-invoices";
import { checklist, checklistProgressByStore, completeTask, reopenTask, rescheduleChecklist, seedChecklist } from "@/server/store-tasks";
import { createSchedule, exportUrl, isDue, runDueExports, runExport, verifyExportToken } from "@/server/exports";
import { claimEvents, lowStockDigest, notifyAlerts, notifyAnnouncements, notifyDepositsDue, notifyExpiringBatches, notifyNewOrders, pushToStaff, saveStaffSubscription, subscribedStores } from "@/server/staff-push";
import { replenishmentPlan } from "@/server/replenishment";
import { getReport } from "@/server/reports";
import { reportContext } from "@/server/reports/context";
import { JOBS } from "@/server/jobs";
import { OPENING_TEMPLATE } from "@/lib/opening";
import { dayKey, addDays, dateOnly, weekdaySA } from "@/lib/format";
import type { Staff } from "@/server/auth";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let hq: Staff;
const actor = (id: string, name: string) => ({ type: "USER" as const, id, name });
const staff = (id: string) => db.user.findUniqueOrThrow({ where: { id }, include: { company: true, store: true, region: true } }) as Promise<Staff>;
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
// A 1×1 PNG and a PDF header: the service checks bytes, not names.
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89]);
const png = (name = "invoice.png") => new File([PNG], name, { type: "image/png" });
const pdf = () => new File([new TextEncoder().encode("%PDF-1.4 test")], "invoice.pdf", { type: "application/pdf" });
const audits = (action: string, entityId?: string) => db.auditLog.count({ where: { action, ...(entityId && { entityId }) } });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await db.user.update({ where: { id: w.manager.id }, data: { email: "mia@example.co.za" } });
  hq = await staff((await db.user.create({ data: { name: "Hanna HQ", role: "HQ_ADMIN", companyId: w.hq.id, email: "hanna@example.co.za" } })).id);
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await db.$disconnect();
});

const storeRef = () => ({ id: w.store.id, code: w.store.code, format: w.store.format, region: { code: w.region.code } });

describe("Today list", () => {
  it("shows only the cycle counts never done and the lot 30 days from expiry for a quiet store", async () => {
    const items = await todayList(storeRef(), w.manager);
    expect(items.map((i) => i.key)).toEqual(["batches", "stock-takes"]); // OIL-A expires in exactly 30 days
    expect(items[0]).toMatchObject({ severity: "medium", count: 1, href: `/store/${w.store.code}/batches?view=expiring` });
    expect(items[1]).toMatchObject({ severity: "medium", count: 3, href: `/store/${w.store.code}/stock-takes/new` });
    expect(items[1].line).toContain("never counted");
    const bare = await db.store.create({ data: { code: "BARE1", slug: "bare1", name: "Bare Store", companyId: w.owner.id, regionId: w.region.id, addressLine: "0 Nowhere", suburb: "x", city: "y", province: "GP", postalCode: "0001" } });
    expect(await todayList({ ...storeRef(), id: bare.id, code: bare.code }, w.manager)).toEqual([]); // nothing ranged, nothing on: all clear
  });

  it("lists orders, cash, alerts (never about you), lots, low stock, authorisations, HQ updates and invoices, urgent first", async () => {
    const order = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.coffeeV.id, qty: 1 }], payMethod: "IN_STORE" });
    expect(order.status).toBe("PLACED");
    await db.shift.create({ data: { storeId: w.store.id, openedById: w.budtender.id, openingFloatCents: 50_000, closedById: w.budtender.id, closedAt: days(-6), countedCashCents: 170_000, expectedCashCents: 170_000 } });
    await raiseAlerts([
      { key: "T:about-budtender", rule: "CASH_SHORT", severity: "HIGH", storeId: w.store.id, userId: w.budtender.id, title: "Cash-up short R500.00", detail: "x", evidence: [] },
      { key: "T:about-manager", rule: "REFUND", severity: "MEDIUM", storeId: w.store.id, userId: w.manager.id, title: "Suspicious refund", detail: "x", evidence: [] },
    ]);
    await db.storeVariant.update({ where: { storeId_variantId: { storeId: w.store.id, variantId: w.coffeeV.id } }, data: { reorderPoint: 20 } });
    await db.patientAuth.create({ data: { customerId: w.patient.id, authNumber: "S21/2026/00002", prescriber: "Dr Test", prescriberRegNo: "MP1", scope: "Oils", monthlyLimitGrams: 30, validFrom: days(-300), validTo: days(5) } });
    const recall = await db.announcement.create({ data: { title: "Recall: OIL-A", body: "Quarantine lot OIL-A", kind: "RECALL", audience: "ALL", requiresAck: true } });
    const paidUp = await captureSupplierInvoice(
      { storeId: w.store.id, storeCode: w.store.code, supplierName: "Test DC", number: "INV-OVERDUE", invoiceDate: dayKey(days(-40)), dueDate: dayKey(days(-10)), totalCents: 115_000, vatCents: 15_000, file: png() },
      actor(w.manager.id, "Mia"),
    );

    const f = await todayFacts(storeRef(), w.manager);
    expect(f.orders).toMatchObject({ placed: 1, picking: 0, ready: 0 });
    expect(f.cash).toMatchObject({ waitingCount: 1, waitingCents: 120_000, overdueCount: 1, overdueCents: 120_000 });
    expect(f.alerts).toEqual({ open: 1, high: 1 }); // the alert about the manager is not theirs to see
    expect(f.batches).toMatchObject({ lots: 1, units: 2 }); // OIL-A expires in 30 days
    expect(f.lowStock).toEqual({ skus: 1, out: 0 });
    expect(f.patients.expiring).toBe(1);
    expect(f.announcements).toMatchObject({ pending: 1, urgent: 1, latestTitle: "Recall: OIL-A" });
    expect(f.supplierInvoices).toMatchObject({ overdue: 1, overdueCents: 115_000 });
    expect((await todayFacts(storeRef(), w.budtender)).alerts).toEqual({ open: 1, high: 0 }); // the budtender sees the one about the manager only

    const items = await todayList(storeRef(), w.manager);
    expect(items.map((i) => i.key)).toEqual(["alerts", "cash", "announcements", "supplier-invoices", "orders", "batches", "low-stock", "stock-takes", "patients"]);
    expect(items.slice(0, 4).every((i) => i.severity === "high")).toBe(true);
    expect(items.find((i) => i.key === "orders")).toMatchObject({ count: 1, severity: "medium", href: `/store/${w.store.code}/orders` });

    // Acknowledging the update and paying the invoice clears their items.
    await db.announcementAck.create({ data: { announcementId: recall.id, storeId: w.store.id, userId: w.manager.id } });
    await paySupplierInvoice(paidUp.id, w.store.id, {}, actor(w.manager.id, "Mia"));
    const after = await todayList(storeRef(), w.manager);
    expect(after.map((i) => i.key)).not.toContain("announcements");
    expect(after.map((i) => i.key)).not.toContain("supplier-invoices");
  });

  it("counts a category as done once a cycle count or a full count is approved", async () => {
    await db.stockTake.create({ data: { number: "ST-T1", storeId: w.store.id, scope: "coffee-drinks", status: "APPROVED", approvedAt: days(-3) } });
    await db.stockTake.create({ data: { number: "ST-T2", storeId: w.store.id, scope: "FULL", status: "APPROVED", approvedAt: days(-45) } });
    const f = await todayFacts(storeRef(), w.manager);
    const by = Object.fromEntries(f.stockTakes.categories.map((c) => [c.slug, c.lastApprovedAt]));
    expect(dayKey(by.flower!)).toBe(dayKey(days(-45)));
    expect(dayKey(by["coffee-drinks"]!)).toBe(dayKey(days(-3)));
    const item = (await todayList(storeRef(), w.manager)).find((i) => i.key === "stock-takes")!;
    expect(item.count).toBe(2); // flower and wellness (45 days ago, cadence 30); coffee was counted 3 days ago
    expect(item.line).toContain("15 days overdue");
  });
});

describe("Staff push", () => {
  it("subscribes a manager's phone and reaches them once per event, logged without VAPID keys", async () => {
    await saveStaffSubscription(w.manager.id, { endpoint: "https://push.example/mia-phone", keys: { p256dh: "p".repeat(20), auth: "a".repeat(12) } }, "Mozilla/5.0 (iPhone)");
    const { stores, people } = await subscribedStores();
    expect(stores.map((s) => s.id)).toEqual([w.store.id]);
    expect(people.map((p) => p.id)).toEqual([w.manager.id]);

    expect(await notifyNewOrders()).toEqual({ pushed: 1 });
    expect(await notifyNewOrders()).toEqual({ pushed: 0 }); // same order, already sent
    const log = await db.messageLog.findFirst({ where: { channel: "PUSH" }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ to: "mia@example.co.za", status: "SENT", reason: "logged (WEB_PUSH keys not set)" });
    expect(log!.body).toContain("New online order · Test Store");
    expect(log!.body).toContain(`/store/${w.store.code}/orders/`);

    // Alerts: the one about the budtender reaches the manager; the one about the manager never does.
    expect(await notifyAlerts()).toEqual({ pushed: 1 });
    const alertPush = await db.messageLog.findMany({ where: { channel: "PUSH", body: { contains: "loss alert" } } });
    expect(alertPush).toHaveLength(1);
    expect(alertPush[0].body).toContain("Cash-up short");
    expect(await notifyAlerts()).toEqual({ pushed: 0 });

    // An HQ update needing acknowledgement, per store that hasn't; the acknowledged recall isn't pushed.
    await db.announcement.create({ data: { title: "New returns policy", body: "Read and brief the team.", kind: "POLICY", audience: "ALL", requiresAck: true } });
    expect(await notifyAnnouncements()).toEqual({ pushed: 1 });
    expect((await db.messageLog.findFirst({ where: { channel: "PUSH", body: { contains: "HQ update" } } }))!.body).toContain("New returns policy");
    expect(await notifyAnnouncements()).toEqual({ pushed: 0 });

    expect(await notifyExpiringBatches()).toEqual({ pushed: 1 }); // OIL-A, 30 days out
    expect(await notifyExpiringBatches()).toEqual({ pushed: 0 });
    expect(await notifyDepositsDue()).toEqual({ pushed: 1 }); // the overdue cash-up
    expect((await db.messageLog.findFirst({ where: { channel: "PUSH", body: { contains: "Cash overdue" } } }))!.body).toContain("R1,200.00");
    expect(await lowStockDigest()).toEqual({ pushed: 1 }); // coffee below its reorder point
    expect(await lowStockDigest()).toEqual({ pushed: 0 }); // once a day
    expect(await claimEvents(["x:1", "x:1"])).toEqual(new Set(["x:1"]));
    expect(await pushToStaff([w.budtender.id], { title: "t", body: "b", url: "/store" })).toEqual({ sent: 0, pruned: 0, users: 0 }); // no phone subscribed
    expect(await db.staffPushEvent.count()).toBeGreaterThan(5);
  });

  it("runs from the scheduler as its own jobs", async () => {
    const r = (await JOBS["staff-push"]()) as { orders: { pushed: number }; alerts: { pushed: number }; announcements: { pushed: number } };
    expect(r).toEqual({ orders: { pushed: 0 }, alerts: { pushed: 0 }, announcements: { pushed: 0 } });
    const ops = (await JOBS.operations()) as { batches: { pushed: number }; exports: { done: number; failed: number }; pruned: { pushEvents: number } };
    expect(ops.batches).toEqual({ pushed: 0 });
    expect(ops.exports).toEqual({ done: 0, failed: 0 });
  });
});

describe("Supplier invoices", () => {
  it("captures an invoice with its file, refuses the wrong file, pays and queries it — all audited", async () => {
    const a = actor(w.manager.id, "Mia");
    const base = { storeId: w.store.id, storeCode: w.store.code, supplierName: "Test DC", invoiceDate: dayKey(days(-2)), dueDate: dayKey(days(28)), totalCents: 230_000, vatCents: 30_000 };
    await expect(captureSupplierInvoice({ ...base, number: "INV-1", file: new File([new TextEncoder().encode("hello")], "x.png", { type: "image/png" }) }, a)).rejects.toThrow("JPEG or PNG photo, or a PDF");
    await expect(captureSupplierInvoice({ ...base, number: "INV-1", file: new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.png") }, a)).rejects.toThrow("over 8 MB");
    await expect(captureSupplierInvoice({ ...base, number: "INV-1", dueDate: dayKey(days(-3)), file: png() }, a)).rejects.toThrow("before the invoice date");
    await expect(captureSupplierInvoice({ ...base, number: "", file: png() }, a)).rejects.toThrow("invoice number");

    const order = await db.stockOrder.create({ data: { number: "PO-T1", kind: "WHOLESALE", status: "RECEIVED", buyerId: w.store.id, sellerId: w.dc.id, totalCents: 230_000, receivedAt: new Date() } });
    const inv = await captureSupplierInvoice({ ...base, number: "INV-1", stockOrderId: order.id, file: pdf() }, a);
    expect(inv).toMatchObject({ status: "DUE", supplierName: "Test DC", number: "INV-1", totalCents: 230_000, vatCents: 30_000, stockOrderId: order.id });
    const upload = await db.upload.findUniqueOrThrow({ where: { id: inv.uploadId } });
    expect(upload).toMatchObject({ contentType: "application/pdf", storeId: w.store.id, uploadedById: w.manager.id });
    expect(upload.key).toMatch(new RegExp(`^supplier-invoices/${w.store.code}/\\d{4}-\\d{2}/.+\\.pdf$`));
    expect(await audits("supplier_invoice.create", inv.id)).toBe(1);
    await expect(captureSupplierInvoice({ ...base, number: "inv-1", file: png() }, a)).rejects.toThrow("already captured");
    expect((await invoicesForOrder(w.store.id, order.id)).map((i) => i.id)).toEqual([inv.id]);

    await expect(querySupplierInvoice(inv.id, w.store.id, "x", a)).rejects.toThrow("what's wrong");
    await querySupplierInvoice(inv.id, w.store.id, "Two units short on the delivery note", a);
    expect((await db.supplierInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("QUERIED");
    await reopenSupplierInvoice(inv.id, w.store.id, a);
    await paySupplierInvoice(inv.id, w.store.id, { paidOn: dayKey(new Date()), note: "EFT 12345" }, a);
    const paid = await db.supplierInvoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(paid).toMatchObject({ status: "PAID", paidById: w.manager.id, note: "EFT 12345" });
    expect(paid.paidAt).not.toBeNull();
    expect(await audits("supplier_invoice.pay", inv.id)).toBe(1);
    await expect(paySupplierInvoice(inv.id, w.store.id, {}, a)).rejects.toThrow("already marked paid");
    await expect(paySupplierInvoice(inv.id, "other-store", {}, a)).rejects.toThrow("not found");

    const list = await supplierInvoiceList({ storeIds: [w.store.id], status: "PAID" }, 1, 10);
    expect(list.total).toBe(2);
    expect(list.rows.find((r) => r.number === "INV-1")).toMatchObject({ number: "INV-1", stockOrderNumber: "PO-T1", createdBy: "Mia Manager", paidBy: "Mia Manager", file: { contentType: "application/pdf" } });
    const s = await supplierInvoiceSummary([w.store.id]);
    expect(s).toMatchObject({ due: 0, overdue: 0, paid30: 2, paid30Cents: 345_000 });
    expect(await supplierInvoicesByStore([w.store.id])).toEqual([]);
    await captureSupplierInvoice({ ...base, number: "INV-2", dueDate: dayKey(days(3)), file: png() }, a);
    expect(await supplierInvoiceSummary([w.store.id])).toMatchObject({ due: 1, dueSoon: 1, dueSoonCents: 230_000 });
    expect((await supplierInvoicesByStore([w.store.id]))[0]).toMatchObject({ storeId: w.store.id, due: 1, dueCents: 230_000, overdue: 0 });
  });
});

describe("Opening checklist", () => {
  it("seeds from the template with due dates back from the opening day, ticks tasks with a note, and reschedules", async () => {
    const opening = days(60);
    const store = await db.store.create({ data: { code: "NEW01", slug: "new01", name: "New Store", companyId: w.owner.id, regionId: w.region.id, dcId: w.dc.id, status: "OPENING_SOON", openedAt: opening, addressLine: "1 New St", suburb: "x", city: "y", province: "GP", postalCode: "0001", licences: ["THC"] } });
    const a = actor(hq.id, hq.name);
    expect(await seedChecklist(db, store, a)).toBe(OPENING_TEMPLATE.length);
    expect(await seedChecklist(db, store, a)).toBe(0);
    let c = await checklist(store.id);
    expect(c.progress).toMatchObject({ total: OPENING_TEMPLATE.length, done: 0, overdue: 4 }); // lease, CIPC, VAT and SAHPRA fall before an opening only 60 days out
    expect(c.groups.map((g) => g.group)).toEqual(["Legal & licences", "Set-up", "People", "Launch"]);
    const soft = c.tasks.find((t) => t.key === "soft-opening")!;
    expect(dayKey(soft.dueAt!)).toBe(dayKey(days(59)));

    const lease = c.tasks.find((t) => t.key === "lease")!;
    await completeTask(store.id, lease.id, "Signed 12 Aug, filed in Drive", { ...a, id: hq.id });
    await expect(completeTask(store.id, lease.id, null, { ...a, id: hq.id })).rejects.toThrow("Already");
    c = await checklist(store.id);
    expect(c.tasks.find((t) => t.key === "lease")).toMatchObject({ doneBy: "Hanna HQ", note: "Signed 12 Aug, filed in Drive" });
    expect(c.progress).toMatchObject({ done: 1, overdue: 3 });
    expect(await audits("store.task_done", lease.id)).toBe(1);
    expect((await checklistProgressByStore([store.id, w.store.id])).get(store.id)).toEqual({ total: OPENING_TEMPLATE.length, done: 1, overdue: 3 });
    expect((await checklistProgressByStore([w.store.id])).size).toBe(0);

    await rescheduleChecklist(store.id, days(120));
    c = await checklist(store.id);
    expect(dayKey(c.tasks.find((t) => t.key === "soft-opening")!.dueAt!)).toBe(dayKey(days(119)));
    expect(dayKey(c.tasks.find((t) => t.key === "lease")!.dueAt!)).toBe(dayKey(days(-30))); // done tasks keep their dates
    expect(c.progress.overdue).toBe(0);
    await reopenTask(store.id, lease.id, { ...a, id: hq.id });
    expect((await checklist(store.id)).progress.done).toBe(0);

    // A store that isn't licensed for THC gets no SAHPRA line; an active store gets no dates.
    const plain = await db.store.create({ data: { code: "NEW02", slug: "new02", name: "Plain Store", companyId: w.owner.id, regionId: w.region.id, status: "ACTIVE", openedAt: days(-10), addressLine: "2 New St", suburb: "x", city: "y", province: "GP", postalCode: "0001" } });
    expect(await seedChecklist(db, plain, a)).toBe(OPENING_TEMPLATE.length - 1);
    const p = await checklist(plain.id);
    expect(p.tasks.some((t) => t.key === "sahpra")).toBe(false);
    expect(p.tasks.every((t) => t.dueAt === null)).toBe(true);
  });
});

describe("Scheduled exports", () => {
  it("schedules a report for staff only, runs it as its owner, stores the CSV and emails a signed link", async () => {
    const a = actor(hq.id, hq.name);
    await expect(createSchedule(hq, { reportKey: "sales-by-store", params: { scope: "hq", range: "7d" }, cadence: "WEEKLY", dayOfWeek: 1, recipients: ["someone@gmail.com"] }, a)).rejects.toThrow("Only staff email addresses");
    await expect(createSchedule(hq, { reportKey: "sales-by-store", params: { scope: "hq" }, cadence: "MONTHLY", dayOfMonth: 31, recipients: ["hanna@example.co.za"] }, a)).rejects.toThrow("1–28");
    await expect(createSchedule(hq, { reportKey: "nope", params: { scope: "hq" }, cadence: "WEEKLY", dayOfWeek: 1, recipients: ["hanna@example.co.za"] }, a)).rejects.toThrow("Unknown report");
    const today = ((weekdaySA(new Date()) + 6) % 7) + 1;
    const s = await createSchedule(hq, { reportKey: "sales-by-store", params: { scope: "hq", range: "7d", junk: "x" }, cadence: "WEEKLY", dayOfWeek: today, recipients: ["Hanna@example.co.za", "mia@example.co.za"] }, a);
    expect(s.params).toEqual({ scope: "hq", range: "7d" });
    expect(s.recipients).toEqual(["hanna@example.co.za", "mia@example.co.za"]);
    expect(isDue(s)).toBe(true);
    expect(isDue({ ...s, dayOfWeek: (today % 7) + 1 })).toBe(false);
    expect(isDue({ ...s, lastRunAt: new Date() })).toBe(false);

    const uploadId = await runExport(s);
    expect(uploadId).toBeTruthy();
    const up = await db.upload.findUniqueOrThrow({ where: { id: uploadId! } });
    expect(up.key).toMatch(/^exports\//);
    expect(up.fileName).toMatch(/^herbal-holland_sales-by-store_network_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
    const mails = await db.messageLog.findMany({ where: { channel: "EMAIL", body: { contains: "Sales by store" } } });
    expect(mails.map((m) => m.to).sort()).toEqual(["hanna@example.co.za", "mia@example.co.za"]);
    // The log keeps where the link points, never the signed link itself.
    expect(mails[0].body).toContain(`/api/exports/${uploadId} (signed link sent; not kept here)`);
    expect(mails[0].body).not.toMatch(/\?e=\d+&t=/);
    const link = exportUrl(uploadId!).match(/\/api\/exports\/([^?\s]+)\?e=(\d+)&t=([\w-]+)/)!;
    expect(link[1]).toBe(uploadId);
    expect(verifyExportToken(link[1], link[2], link[3])).toBe(true);
    expect(verifyExportToken(link[1], link[2], "tampered")).toBe(false);
    expect(verifyExportToken(link[1], "1", link[3])).toBe(false); // expired
    expect(exportUrl(uploadId!)).toContain(`/api/exports/${uploadId}?e=`);
    expect(await db.auditLog.count({ where: { action: "report.export", entityId: "sales-by-store", actorType: "SYSTEM" } })).toBe(1);

    expect(await runDueExports()).toEqual({ done: 0, failed: 0 }); // already ran today
    await db.scheduledExport.update({ where: { id: s.id }, data: { lastRunAt: null } });
    expect(await runDueExports()).toEqual({ done: 1, failed: 0 });
  });
});

describe("Forecast-driven replenishment and cohort reports", () => {
  it("suggests from the 14-day forecast and reports cohorts and retention", async () => {
    const today = dayKey(new Date());
    for (let i = 1; i <= 14; i++) {
      const date = dateOnly(addDays(new Date(), -i));
      await db.dailyVariantStat.create({ data: { storeId: w.store.id, date, variantId: w.coffeeV.id, units: 2, netCents: 2 * 19_913, costCents: 2 * 6_500 } });
    }
    const plan = await replenishmentPlan(w.store.id);
    const coffee = plan.find((r) => r.variantId === w.coffeeV.id)!;
    expect(coffee.forecastPerWeek).toBe(14);
    expect(coffee.safetyStock).toBe(0);
    // 11 available (one reserved by the open order), nothing on order, reorder point 20 → top up to 17 days × 2
    expect(coffee).toMatchObject({ available: 11, onOrder: 0, suggested: 34 - 11 });
    const flower = plan.find((r) => r.variantId === w.flowerV.id)!;
    expect(flower).toMatchObject({ forecastPerWeek: 0, suggested: 0 });

    const lines = [{ variantId: w.coffeeV.id, qty: 1 }];
    const q = await quote({ storeId: w.store.id, channel: "POS", items: lines, customerId: w.walkIn.id });
    await postPosSale({ id: randomUUID(), number: "TST01-C00001", customerId: w.walkIn.id, lines, ageCheck: "ID_SIGHTED", payments: [{ method: "CARD", amountCents: q.totalCents }] }, { storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Mia" });

    const run = async (key: string) => {
      const def = getReport(key)!;
      const r = await reportContext({ def, scope: "hq", user: hq, sp: { range: "30d" }, mode: "screen", basePath: "/hq/reports" });
      return def.run(r.ctx);
    };
    const c = await run("cohorts");
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]).toMatchObject({ members: 2, m0: 0.5 }); // two members joined this month; one bought
    expect(c.chart?.kind).toBe("matrix");
    expect(c.columns.map((x) => x.key).slice(0, 3)).toEqual(["cohort", "members", "m0"]);
    const r = await run("retention");
    const month = r.rows.find((x) => x.sales)!;
    expect(month).toMatchObject({ newMembers: 2, buyers: 1, repeatBuyers: 0, repeatRate: 0, retention90: null });
    expect(r.summary?.[0]).toMatchObject({ label: "Repeat purchase rate", value: 0 });
    expect(r.chart?.kind).toBe("area");
    expect(today.slice(0, 4)).toMatch(/^\d{4}$/);
  });
});
