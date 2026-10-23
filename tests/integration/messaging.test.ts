import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { requestOtp } from "@/server/customers";
import { sendBulk, optOutToken } from "@/server/messaging";
import { POST } from "@/app/api/unsubscribe/route";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => db.$disconnect());

const lastLog = () => db.messageLog.findFirstOrThrow({ orderBy: { createdAt: "desc" } });

describe("Messaging", () => {
  it("texts the sign-in code through SMSPortal but never logs it", async () => {
    vi.stubEnv("MESSAGING_PROVIDER", "smsportal");
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await requestOtp("082 555 0101");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rest.smsportal.com/v3/BulkMessages");
    const sent = JSON.parse(String(init.body)).messages[0];
    expect(sent.destination).toBe("27825550101");
    expect(sent.content).toMatch(/code is \d{6}\./);
    const log = await lastLog();
    expect(log.status).toBe("SENT");
    expect(log.body).not.toMatch(/\d{6}/);
  });

  it("tells the customer when the code couldn't be sent", async () => {
    vi.stubEnv("MESSAGING_PROVIDER", "smsportal");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(requestOtp("082 555 0102")).rejects.toThrow(/couldn't send/);
    expect(await lastLog()).toMatchObject({ status: "FAILED", reason: expect.stringContaining("503") });
  });

  it("logs campaign messages per recipient and counts deliveries", async () => {
    const campaign = await db.campaign.create({ data: { name: "Test", channel: "EMAIL", segment: "ALL", message: "Hi" } });
    const rows = [w.patient, w.walkIn].map((c) => ({ campaignId: campaign.id, customerId: c.id, to: `${c.firstName}@example.co.za`, channel: "EMAIL" as const, body: "Hi", subject: "Test" }));
    expect(await sendBulk(rows)).toBe(2);
    expect(await db.messageLog.count({ where: { campaignId: campaign.id, status: "SENT" } })).toBe(2);
  });

  it("unsubscribes in one click with a signed link only", async () => {
    await db.customer.update({ where: { id: w.walkIn.id }, data: { consentEmail: true } });
    const url = (t: string) => `http://localhost/api/unsubscribe?c=${w.walkIn.id}&ch=EMAIL&t=${t}`;
    expect((await POST(new Request(url("A".repeat(22)), { method: "POST" }))).status).toBe(400);
    expect((await POST(new Request(url(optOutToken(w.walkIn.id, "EMAIL")), { method: "POST" }))).status).toBe(200);
    expect((await db.customer.findUniqueOrThrow({ where: { id: w.walkIn.id } })).consentEmail).toBe(false);
    expect(await db.consentEvent.count({ where: { customerId: w.walkIn.id, channel: "EMAIL", granted: false } })).toBe(1);
  });
});

describe("Sign-in codes by email", () => {
  it("emails the code to a new number's own address, or to the email already on the member's account, never elsewhere", async () => {
    vi.stubEnv("MESSAGING_PROVIDER", "log");
    const r = await requestOtp("082 555 0401", { ip: null, email: "New.Member@Example.com" });
    expect(r).toMatchObject({ phone: "+27825550401", email: "new.member@example.com" });
    const log = await db.messageLog.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ channel: "EMAIL", to: "new.member@example.com", status: "SENT", kind: "TRANSACTIONAL" });
    expect(log.body).not.toMatch(/\d{6}/);
    expect(log.body).toContain("Your Herbal Holland code is ••••••");

    const member = await db.customer.update({ where: { id: w.patient.id }, data: { email: "patient@example.co.za" }, select: { phone: true, email: true } });
    await expect(requestOtp(member.phone, { ip: null, email: "someone.else@example.com" })).rejects.toThrow(/isn't the email on your account/);
    expect((await requestOtp(member.phone, { ip: null, email: member.email!.toUpperCase() })).email).toBe(member.email);
    const noEmail = await db.customer.update({ where: { id: w.walkIn.id }, data: { email: null }, select: { phone: true } });
    await expect(requestOtp(noEmail.phone, { ip: null, email: "x@example.com" })).rejects.toThrow(/no email on your account/);
    await expect(requestOtp("082 555 0402", { ip: null, email: "not-an-email" })).rejects.toThrow(/doesn't look right/);
  });
});
