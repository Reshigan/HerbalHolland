import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { postPosSale, refundSale } from "@/server/sales";
import { quote } from "@/server/pricing";
import { getObject } from "@/server/storage";
import { recordDeposit, reviewDeposit, waitingCash } from "@/server/banking";
import { checkShifts, raiseAlerts, runLossRules, visibleAlerts } from "@/server/loss";
import { approveMonth, monthCommission, releaseHeld, thisMonth } from "@/server/commission";
import { DEFAULT_LOSS } from "@/lib/loss";
import { vatOf } from "@/lib/money";
import { dayKey } from "@/lib/format";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let owner: { id: string; name: string; email: string | null };
let seq = 0;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);
const actor = (u: { id: string; name: string }) => ({ type: "USER" as const, id: u.id, name: u.name });
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70])], "slip.jpg", { type: "image/jpeg" });
const shift = (daysAgo: number, counted: number, expected = counted) =>
  db.shift.create({ data: { storeId: w.store.id, openedById: w.manager.id, openedAt: ago(daysAgo, 10), openingFloatCents: 100_000, closedById: w.manager.id, closedAt: ago(daysAgo, 1), expectedCashCents: expected, countedCashCents: counted } });
async function sell(staff: { id: string; name: string }, customerId: string, variantId: string, method: "CARD" | "CASH" = "CARD") {
  const lines = [{ variantId, qty: 1 }];
  const q = await quote({ storeId: w.store.id, channel: "POS", items: lines, customerId });
  const { sale } = await postPosSale(
    { id: randomUUID(), number: `TST01-C${String(++seq).padStart(5, "0")}`, customerId, lines, ageCheck: "ID_SIGHTED", payments: [{ method, amountCents: q.totalCents }] },
    { storeId: w.store.id, deviceId: w.device.id, staffId: staff.id, staffName: staff.name },
  );
  return db.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true } });
}
const refund = (sale: { id: string; lines: { id: string }[] }, by: { id: string; name: string }, method: "CASH" | "CARD" = "CASH") =>
  refundSale({ id: randomUUID(), number: `TST01-R${String(++seq).padStart(5, "0")}`, saleId: sale.id, lines: [{ saleLineId: sale.lines[0].id, qty: 1, restock: true }], method, reason: "Changed their mind", staffId: by.id, staffName: by.name, deviceId: w.device.id });

beforeAll(async () => {
  process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "hh-uploads-"));
  await resetDb();
  w = await buildWorld();
  owner = await db.user.create({ data: { name: "Olive Owner", email: "owner@example.co.za", role: "OWNER", companyId: w.owner.id } });
  await db.user.create({ data: { name: "Ari Area", email: "area@example.co.za", role: "AREA_MANAGER", regionId: w.region.id } });
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500));
  await db.$disconnect();
});

describe("Cash banking", () => {
  it("banks the cash from closed cash-ups (counted less float) with the slip kept as proof", async () => {
    const a = await shift(1, 350_000);
    const b = await shift(1, 250_000);
    expect((await waitingCash(w.store.id)).map((s) => s.cashCents).sort()).toEqual([150_000, 250_000]);
    const d = await recordDeposit({ storeId: w.store.id, storeCode: w.store.code, shiftIds: [a.id, b.id], amountCents: 400_000, bankedOn: new Date(), reference: "TST-001", file: jpeg() }, actor(w.manager));
    expect(d).toMatchObject({ expectedCents: 400_000, amountCents: 400_000, status: "RECORDED" });
    expect(await waitingCash(w.store.id)).toHaveLength(0);
    const slip = await db.upload.findUniqueOrThrow({ where: { id: d.slipId } });
    expect([...(await getObject(slip.key))]).toEqual([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70]);
    await expect(recordDeposit({ storeId: w.store.id, storeCode: w.store.code, shiftIds: [a.id], amountCents: 1, bankedOn: new Date(), reference: "x", file: jpeg() }, actor(w.manager))).rejects.toThrow(/already banked/);
  });

  it("accepts photos and PDFs only, judged by their bytes", async () => {
    const s = await shift(1, 200_000);
    const svg = new File(["<svg onload=alert(1)>"], "slip.jpg", { type: "image/jpeg" });
    await expect(recordDeposit({ storeId: w.store.id, storeCode: w.store.code, shiftIds: [s.id], amountCents: 100_000, bankedOn: new Date(), reference: "x", file: svg }, actor(w.manager))).rejects.toThrow(/photo .* or a PDF/);
  });

  it("raises a high alert for a short deposit, emailed to the owner and area manager", async () => {
    const s = await shift(1, 300_000);
    const d = await recordDeposit({ storeId: w.store.id, storeCode: w.store.code, shiftIds: [s.id], amountCents: 180_000, bankedOn: new Date(), reference: "TST-002", file: jpeg() }, actor(w.manager));
    const alert = await db.alert.findUniqueOrThrow({ where: { key: `DEPOSIT_SHORT:${d.id}` } });
    expect(alert).toMatchObject({ severity: "HIGH", amountCents: 20_000, userId: w.manager.id });
    expect(alert.notifiedAt).toBeInstanceOf(Date);
    const mail = await db.messageLog.findMany({ where: { channel: "EMAIL", body: { contains: d.number } } });
    expect(mail.map((m) => m.to).sort()).toEqual(["area@example.co.za", "owner@example.co.za"]);
  });

  it("is checked by someone other than the person who banked it, and locked once verified", async () => {
    const s = await shift(1, 150_000);
    const d = await recordDeposit({ storeId: w.store.id, storeCode: w.store.code, shiftIds: [s.id], amountCents: 50_000, bankedOn: new Date(), reference: "TST-003", file: jpeg() }, actor(w.manager));
    await expect(reviewDeposit(d.id, w.store.id, "VERIFIED", null, actor(w.manager))).rejects.toThrow(/Someone else/);
    await expect(reviewDeposit(d.id, w.store.id, "QUERIED", null, actor(owner))).rejects.toThrow(/Say what/);
    await reviewDeposit(d.id, w.store.id, "VERIFIED", null, actor(owner));
    await expect(reviewDeposit(d.id, w.store.id, "QUERIED", "late", actor(owner))).rejects.toThrow(/locked/);
  });
});

describe("Loss prevention", () => {
  it("flags a short cash-up once, and never shows the alert to the person it's about", async () => {
    const s = await shift(0, 290_000, 296_000);
    const found = await checkShifts({ id: s.id }, DEFAULT_LOSS);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: "CASH_SHORT", severity: "MEDIUM", amountCents: 6_000, userId: w.manager.id });
    await raiseAlerts(found);
    await raiseAlerts(found);
    expect(await db.alert.count({ where: { key: `CASH_SHORT:${s.id}` } })).toBe(1);
    expect(await db.alert.count({ where: { AND: [visibleAlerts(w.manager, [w.store.id]), { key: `CASH_SHORT:${s.id}` }] } })).toBe(0);
    expect(await db.alert.count({ where: { AND: [visibleAlerts(owner, [w.store.id]), { key: `CASH_SHORT:${s.id}` }] } })).toBe(1);
  });

  it("nightly: overdue banking, a card sale refunded in cash, and sales on a staff member's own card", async () => {
    const late = await shift(6, 260_000);
    const sale = await sell(w.budtender, w.walkIn.id, w.oilV.id, "CARD");
    const r = await refund(sale, w.manager, "CASH");
    await db.user.update({ where: { id: w.budtender.id }, data: { memberId: w.walkIn.id } });
    await sell(w.budtender, w.walkIn.id, w.oilV.id, "CARD");

    await runLossRules();
    const by = async (key: string) => db.alert.findUnique({ where: { key } });
    expect(await by(`DEPOSIT_OVERDUE:${w.store.id}:${late.id}`)).toMatchObject({ rule: "DEPOSIT_OVERDUE", amountCents: 160_000 });
    expect(await by(`REFUND:${r.id}`)).toMatchObject({ severity: "HIGH", userId: w.manager.id });
    expect((await by(`REFUND:${r.id}`))!.detail).toMatch(/card sale refunded in cash; someone else's sale; refunded 0 min after the sale/);
    expect(await by(`OWN_MEMBER:${w.budtender.id}:${dayKey(new Date())}`)).toMatchObject({ rule: "OWN_MEMBER", severity: "MEDIUM" });
    expect((await runLossRules()).raised).toBe(0); // idempotent
    await db.user.update({ where: { id: w.budtender.id }, data: { memberId: null } });

    // One live overdue alert per store: kept up to date as more cash goes overdue, closed once it's all banked.
    const later = await shift(5, 150_000);
    await runLossRules();
    expect(await db.alert.findMany({ where: { storeId: w.store.id, rule: "DEPOSIT_OVERDUE" }, select: { key: true, amountCents: true } })).toEqual([{ key: `DEPOSIT_OVERDUE:${w.store.id}:${late.id}`, amountCents: 210_000 }]);
    await recordDeposit({ storeId: w.store.id, storeCode: w.store.code, shiftIds: [late.id, later.id], amountCents: 210_000, bankedOn: new Date(), reference: "TST-004", file: jpeg() }, actor(w.manager));
    await runLossRules();
    expect(await by(`DEPOSIT_OVERDUE:${w.store.id}:${late.id}`)).toMatchObject({ status: "RESOLVED", closedById: null });
  });
});

describe("Commission", () => {
  it("pays on commissionable net sales ex VAT: no medicines, not on their own card, clawed back by refunds, held while an alert is open", async () => {
    await db.user.updateMany({ where: { memberId: w.walkIn.id }, data: { memberId: null } });
    const cara = await db.user.create({ data: { name: "Cara Commission", role: "BUDTENDER", storeId: w.store.id, memberId: w.walkIn.id, canDispense: true } });
    await db.store.update({ where: { id: w.store.id }, data: { commissionOn: true } });
    const coffee = await sell(cara, w.patient.id, w.coffeeV.id); // CBD food & drink: commissionable
    await sell(cara, w.patient.id, w.flowerV.id); // licensed medicine: never commission (s18A)
    const oil = await sell(cara, w.patient.id, w.oilV.id); // CBD supplement: no commission until counsel clears it (s18A)
    await sell(cara, w.walkIn.id, w.coffeeV.id); // her own member card: doesn't count
    const net = coffee.lines[0].totalCents - coffee.lines[0].vatCents;
    expect(coffee.lines[0].vatCents).toBe(vatOf(coffee.lines[0].totalCents));
    expect(oil.lines[0].totalCents).toBe(59_500); // and no member price on it either
    const month = thisMonth();
    let [line] = await monthCommission(w.store.id, month, cara.id);
    expect(line).toMatchObject({ salesCents: net, refundsCents: 0, commissionCents: Math.round(net * 0.02), held: false });

    await refund(coffee, w.manager, "CARD"); // someone else processes it — still clawed back from Cara
    [line] = await monthCommission(w.store.id, month, cara.id);
    expect(line).toMatchObject({ refundsCents: -net, commissionCents: 0 });

    // Last month: one sale, with an open alert about her at approval time.
    const past = await sell(cara, w.patient.id, w.coffeeV.id);
    const lastMonth = dayKey(new Date(new Date(`${month}-01T12:00:00+02:00`).getTime() - 5 * 86_400_000)).slice(0, 7);
    await db.sale.update({ where: { id: past.id }, data: { createdAt: new Date(`${lastMonth}-15T10:00:00+02:00`) } });
    const alert = await db.alert.create({ data: { key: `TEST:${cara.id}`, rule: "REFUND", severity: "MEDIUM", storeId: w.store.id, userId: cara.id, title: "Test", detail: "Test", evidence: [] } });
    const run = await approveMonth(w.store.id, lastMonth, actor(owner));
    const pay = Math.round((past.lines[0].totalCents - past.lines[0].vatCents) * 0.02);
    expect((run.lines as { userId: string; held: boolean; commissionCents: number }[]).find((l) => l.userId === cara.id)).toMatchObject({ held: true, commissionCents: pay });
    await expect(approveMonth(w.store.id, lastMonth, actor(owner))).rejects.toThrow(/already approved/);
    await expect(approveMonth(w.store.id, month, actor(owner))).rejects.toThrow(/once it has ended/);
    await expect(releaseHeld(w.store.id, lastMonth, cara.id, actor(owner))).rejects.toThrow(/open alerts/);
    await db.alert.update({ where: { id: alert.id }, data: { status: "RESOLVED" } });
    await releaseHeld(w.store.id, lastMonth, cara.id, actor(owner));
    expect((await db.commissionRun.findUniqueOrThrow({ where: { id: run.id } })).totalCents).toBe(run.totalCents + pay);
  });
});
