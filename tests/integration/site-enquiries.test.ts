// The endpoint the herbalholland.com Worker forwards franchise enquiries to (src/app/api/site/enquiries/route.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { POST } from "@/app/api/site/enquiries/route";
import { resetDb } from "./world";

const call = (auth: string | null, body: unknown) =>
  POST(new Request("http://app/api/site/enquiries", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) }));
const lead = {
  name: "Thandi Mokoena", email: "thandi.site@example.co.za", phone: "+27825550142", area: "Hillcrest", province: "KZN",
  experience: "Ran a pharmacy in Pinetown for nine years, eleven staff.", capital: "1.5-3m", pharmacist: "yes", consent: "on", source: "site", reference: "WEB-000001", ip: "196.25.1.9",
};

beforeAll(async () => {
  process.env.SITE_ENQUIRY_SECRET = "site-enquiry-test-secret";
  await resetDb();
});
afterAll(() => db.$disconnect());

describe("Enquiries forwarded from herbalholland.com", () => {
  it("needs the shared secret", async () => {
    expect((await call(null, lead)).status).toBe(401);
    expect((await call("Bearer wrong", lead)).status).toBe(401);
    expect(await db.franchiseLead.count()).toBe(0);
  });
  it("creates an FL-numbered lead for HQ, checked by the same rules", async () => {
    const res = await call("Bearer site-enquiry-test-secret", lead);
    const body = (await res.json()) as { ok: boolean; number: string };
    expect(res.status).toBe(200);
    expect(body.number).toMatch(/^FL-\d{6}$/);
    expect(await db.franchiseLead.findFirstOrThrow({ where: { number: body.number } })).toMatchObject({ email: lead.email, province: "KZN", pharmacist: true, source: "site", status: "NEW" });
    const bad = await call("Bearer site-enquiry-test-secret", { ...lead, email: "not-an-email" });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { fields: Record<string, string> }).fields.email).toBeTruthy();
  });
});
