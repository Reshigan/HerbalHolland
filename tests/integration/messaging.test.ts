import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { createCustomer, requestOtp, verifyOtp } from "@/server/customers";
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
    expect(sent.content).toMatch(/^Herbal Holland: \d{6} is your code\. Valid 10 minutes\.$/); // the short wording networks deliver
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
    vi.unstubAllEnvs();
    await expect(requestOtp("082 555 0400", { ip: null, email: "x@example.com" })).rejects.toThrow(/aren't available right now/); // no email transport, no demo
    vi.stubEnv("MESSAGING_PROVIDER", "log");
    vi.stubEnv("DEMO_MODE", "true"); // the demo shows codes on screen, so email codes need no transport
    const r = await requestOtp("082 555 0401", { ip: null, email: "New.Member@Example.com" });
    expect(r).toMatchObject({ phone: "+27825550401", email: "new.member@example.com" });
    const log = await db.messageLog.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ channel: "EMAIL", to: "new.member@example.com", status: "SENT", kind: "TRANSACTIONAL" });
    expect(log.body).not.toMatch(/\d{6}/);
    expect(log.body).toContain("•••••• is your code");

    // A member's own email carries codes only once a code has reached it; an address typed into the profile hasn't.
    const member = await db.customer.update({ where: { id: w.patient.id }, data: { email: "patient@example.co.za", emailVerifiedAt: null }, select: { phone: true, email: true } });
    await expect(requestOtp(member.phone, { ip: null, email: member.email! })).rejects.toThrow(/isn't the email you joined with/);
    await db.customer.update({ where: { id: w.patient.id }, data: { emailVerifiedAt: new Date() } });
    await expect(requestOtp(member.phone, { ip: null, email: "someone.else@example.com" })).rejects.toThrow(/isn't the email you joined with/);
    expect((await requestOtp(member.phone, { ip: null, email: member.email!.toUpperCase() })).email).toBe(member.email);
    const noEmail = await db.customer.update({ where: { id: w.walkIn.id }, data: { email: null }, select: { phone: true } });
    await expect(requestOtp(noEmail.phone, { ip: null, email: "x@example.com" })).rejects.toThrow(/no email on your account/);
    await expect(requestOtp("082 555 0402", { ip: null, email: "not-an-email" })).rejects.toThrow(/doesn't look right/);
  });
});

describe("Email codes and the phone's owner", () => {
  it("isn't stopped by the SMS ceiling, and the phone's own code claims a number joined through an inbox", async () => {
    vi.stubEnv("MESSAGING_PROVIDER", "log");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("OTP_SMS_HOURLY_MAX", "1"); // the hour's texts above already fill this ceiling
    await expect(requestOtp("082 555 0502")).rejects.toThrow(/can't send codes right now/);
    expect((await requestOtp("082 555 0503", { ip: null, email: "by.email@example.com" })).email).toBe("by.email@example.com"); // not a text
    vi.stubEnv("OTP_SMS_HOURLY_MAX", "500");

    // Someone joins 082 555 0601 with a code to their own inbox: the email is proven, the number is not.
    const sent = await requestOtp("082 555 0601", { ip: null, email: "joiner@example.com" });
    const otp = await db.otp.findFirstOrThrow({ where: { phone: sent.phone }, orderBy: { createdAt: "desc" } });
    expect(otp.sentTo).toBe("joiner@example.com");
    const joined = await createCustomer({ phone: sent.phone, firstName: "Joiner", email: "joiner@example.com", homeStoreId: w.store.id, consents: {}, source: "WEB", termsAccepted: true, dob: new Date("1990-01-01T00:00:00Z"), codeSentTo: "joiner@example.com" }, { type: "CUSTOMER", name: "Joiner" });
    expect(joined).toMatchObject({ phoneVerifiedAt: null, emailVerifiedAt: expect.any(Date) });
    // The phone's holder signs in with a code to the phone: the number is theirs, and the inbox that joined it is dropped.
    vi.stubEnv("DEMO_MODE", "true");
    const code = (await requestOtp(sent.phone)).demoCode!;
    const r = await verifyOtp(sent.phone, code);
    expect(r.sentTo).toBeNull();
    expect(r.customer).toMatchObject({ phoneVerifiedAt: expect.any(Date), email: null, emailVerifiedAt: null });
    expect(await db.auditLog.count({ where: { action: "customer.phone_claimed", entityId: joined.id } })).toBe(1);
    // A second SMS sign-in is an ordinary one.
    const again = await verifyOtp(sent.phone, (await requestOtp(sent.phone)).demoCode!);
    expect(await db.auditLog.count({ where: { action: "customer.phone_claimed", entityId: joined.id } })).toBe(1);
    expect(again.customer?.id).toBe(joined.id);
  });
});
