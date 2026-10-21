// TEMPORARY: times each step of the staff sign-in path on the Worker to find the call that never settles.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { verifySecret } from "@/server/crypto";

export const dynamic = "force-dynamic";

const step = async (name: string, fn: () => Promise<unknown>) => {
  const t0 = Date.now();
  const timeout = new Promise<string>((r) => setTimeout(() => r("TIMEOUT 4s"), 4000));
  try {
    const v = await Promise.race([fn().then((x) => `ok ${JSON.stringify(x)?.slice(0, 60)}`), timeout]);
    return `${name}: ${v} (${Date.now() - t0}ms)`;
  } catch (e) {
    return `${name}: ERROR ${(e as Error).message.slice(0, 120)} (${Date.now() - t0}ms)`;
  }
};

export async function GET() {
  const out: string[] = [];
  out.push(await step("raw", () => db.$queryRaw`SELECT 1 AS one`));
  out.push(await step("findUnique", async () => (await db.user.findUnique({ where: { email: "hq@herbalholland.com" }, select: { id: true } }))?.id));
  out.push(await step("findFirst", async () => (await db.user.findFirst({ where: { role: "HQ_ADMIN" }, select: { id: true } }))?.id));
  out.push(await step("scrypt direct", () => new Promise((done, fail) => scrypt("holland", randomBytes(16), 32, { N: 16384, r: 8, p: 5 }, (e, k) => (e ? fail(e) : done(k.length))))));
  const user = await db.user.findFirst({ where: { role: "HQ_ADMIN" }, select: { passwordHash: true } }).catch(() => null);
  out.push(await step("verifySecret", () => verifySecret("holland", user?.passwordHash)));
  out.push(await step("hash+equal", async () => timingSafeEqual(createHash("sha256").update("a").digest(), createHash("sha256").update("a").digest())));
  out.push(await step("session create", () => db.session.create({ data: { id: `diag-${Date.now()}`, userId: null, expiresAt: new Date(Date.now() + 1000) } }).then((s) => s.id)));
  out.push(await step("cookies", async () => (await cookies()).get("hh_age")?.value ?? "none"));
  // Does a failed write wedge the client? A duplicate region (unique code), then ordinary queries.
  out.push(await step("dup create (expect P2002)", () => db.region.create({ data: { code: "KZN", name: "dup" } })));
  out.push(await step("after error: findFirst", async () => (await db.region.findFirst({ select: { code: true } }))?.code));
  out.push(await step("after error: nested create+fail", () => db.customer.create({ data: { phone: "0000000000", email: "hq@herbalholland.com", firstName: "x", lastName: "y", memberNo: "DUP" } as never })));
  out.push(await step("after nested error: count", () => db.region.count()));
  out.push(await step("after nested error: raw", () => db.$queryRaw`SELECT 2 AS two`));
  out.push(await step("tx with error inside", () => db.$transaction(async (t) => { await t.region.create({ data: { code: "KZN", name: "dup" } }); })));
  out.push(await step("after tx error: count", () => db.region.count()));
  return new NextResponse(out.join("\n"), { headers: { "content-type": "text/plain" } });
}
