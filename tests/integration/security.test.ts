// Sign-in hardening: one-time codes hold their limits under concurrent requests (per address, per connection, the SMS
// ceiling), a till's PIN session is never a back-office sign-in, sessions lapse when unused, passwords are hashed at
// today's cost (older hashes upgraded on sign-in) and follow the policy, wrong passwords and PINs are counted per account
// and per connection, demo sign-in can't reach a real account, trade sign-in codes don't reveal who's a buyer, ID-number
// and email collisions are rationed, cross-site requests can't use the till's cookies, and signed links never 500.
import { randomBytes, scryptSync } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The request's cookies and headers, as the session readers and actions see them.
const jar = new Map<string, string>();
const hdrs = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => hdrs,
}));
vi.mock("next/cache", async (real) => ({ ...(await real<typeof import("next/cache")>()), revalidatePath: () => undefined, refresh: () => undefined }));

import { db } from "@/server/db";
import { hashSecret, needsRehash, NO_HASH, safeEqual, sha256, verifySecret } from "@/server/crypto";
import { checkCode, issueCode, OtpLimitError } from "@/server/otp";
import { COOKIE, getStaff, getStaffChangingPassword, purgeAuthRecords, tradeBuyerForToken } from "@/server/auth";
import { clearFailures, IP_LOCKED, isLocked, PIN_DISABLED, recordFailure } from "@/server/lockout";
import { clear, ipKey } from "@/server/throttle";
import { requestOtp, COLLISION_REFUSED, createCustomer } from "@/server/customers";
import { requestTradeCode, verifyTradeCode } from "@/server/trade/auth";
import { pinSignIn, verifyPairingUser } from "@/server/pos/session";
import { open, withDevice } from "@/server/pos/http";
import { getSnapshot, putSnapshot } from "@/server/pos/display";
import { validOptOut } from "@/server/messaging";
import { readShare } from "@/server/share";
import { authFlow, verifyAgeWithId } from "@/server/shop/actions";
import { signPhone } from "@/server/shop/phone-token";
import { SHOP_COOKIE } from "@/server/shop/context";
import { login } from "@/app/login/actions";
import { changePassword } from "@/app/account/password/actions";
import { GET as demoSignIn } from "@/app/api/auth/demo/route";
import { POST as logout } from "@/app/logout/route";
import { POST as renewPush } from "@/app/api/push/renew/route";
import { GET as reorderLink } from "@/app/(shop)/r/[id]/[token]/route";
import { addUser, resetPassword as hqResetPassword } from "@/app/hq/team/actions";
import { addStaff, resetPassword as storeResetPassword, resetPin } from "@/app/store/[code]/team/actions";
import { DEMO_PASSWORD } from "@/lib/password";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => db.$disconnect());

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
/** An action's result, or where it redirected to. */
async function run<T>(p: Promise<T>): Promise<{ state?: T; to?: string }> {
  try {
    return { state: await p };
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return { to: digest.split(";")[2] };
    throw e;
  }
}
/** A hash as the app wrote them before the cost was stored (N=16384, r=8, p=1). */
const legacyHash = (secret: string) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url")}`;
};
const fromIp = (ip: string | null) => (ip ? hdrs.set("x-real-ip", ip) : hdrs.delete("x-real-ip"));
const signInAs = async (userId: string) => {
  const token = `office-${userId}-${Math.random()}`;
  await db.session.create({ data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + 3_600_000) } });
  jar.set(COOKIE.staff, token);
  return token;
};
const audits = (action: string, entityId?: string) => db.auditLog.count({ where: { action, ...(entityId && { entityId }) } });
const luhnOk = (d: string) => {
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    let x = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) (x *= 2), x > 9 && (x -= 9);
    s += x;
  }
  return s % 10 === 0;
};
/** A valid SA ID number for someone born on the YYMMDD given. */
const saId = (yymmdd: string, seq: string) => [...Array(10).keys()].map((z) => `${yymmdd}${seq}08${z}`).find(luhnOk)!;

describe("One-time codes", () => {
  const phone = "+27825550111";
  it("counts at most five tries per code, however many arrive at once", async () => {
    const code = await issueCode({ phone });
    expect(code).toMatch(/^\d{6}$/);
    const wrong = code === "000000" ? "111111" : "000000";
    const results = await Promise.all(Array.from({ length: 20 }, () => checkCode({ phone }, wrong)));
    expect(results.filter((r) => r === "wrong")).toHaveLength(5);
    expect(results.filter((r) => r === "expired")).toHaveLength(15);
    // Used up: even the right code no longer works.
    expect(await checkCode({ phone }, code!)).toBe("expired");
  });

  it("locks an address for the hour after ten wrong tries across its codes", async () => {
    await issueCode({ phone }); // the second code: five more wrong makes ten
    for (let i = 0; i < 5; i++) expect(await checkCode({ phone }, "999999")).not.toBe("ok");
    const third = await issueCode({ phone });
    expect(await checkCode({ phone }, third!)).toBe("locked");
  });

  it("sends at most five codes per address per ten minutes, however many are asked for at once", async () => {
    const email = "buyer@throttle.example";
    const codes = await Promise.all(Array.from({ length: 12 }, () => issueCode({ email })));
    expect(codes.filter(Boolean)).toHaveLength(5);
    expect(await db.otp.count({ where: { email } })).toBe(5);
  });

  it("sends at most thirty codes an hour to one connection, whatever the addresses", async () => {
    const ip = "198.51.100.20";
    await db.throttle.createMany({ data: Array.from({ length: 29 }, () => ({ key: `otp-ip:${ipKey(ip)}` })) });
    expect(await issueCode({ email: "thirtieth@ip.example" }, { ip })).toMatch(/^\d{6}$/);
    await expect(issueCode({ email: "thirty-first@ip.example" }, { ip })).rejects.toThrow("Too many codes requested. Try again in an hour");
    await expect(requestOtp("082 555 0177", { ip })).rejects.toThrow("Too many codes requested. Try again in an hour");
    expect(await issueCode({ email: "other@ip.example" }, { ip: "198.51.100.21" })).toMatch(/^\d{6}$/);
  });

  it("stops SMS codes network-wide at the hourly ceiling, saying so once", async () => {
    vi.stubEnv("OTP_SMS_HOURLY_MAX", "2");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await clear("otp-sms:all");
    expect(await issueCode({ phone: "+27825550301" })).toMatch(/^\d{6}$/);
    expect(await issueCode({ phone: "+27825550302" })).toMatch(/^\d{6}$/);
    await expect(issueCode({ phone: "+27825550303" })).rejects.toBeInstanceOf(OtpLimitError);
    await expect(requestOtp("082 555 0304")).rejects.toThrow("We can't send codes right now. Please try again shortly");
    expect(logged).toHaveBeenCalledTimes(1);
    expect(await audits("otp.ceiling")).toBe(1);
    expect(await issueCode({ email: "not-sms@ceiling.example" })).toMatch(/^\d{6}$/); // email codes aren't texts
    await clear("otp-sms:all");
  });
});

describe("Secrets", () => {
  it("hashes at today's cost, reads the older format and asks for an upgrade", async () => {
    const h = await hashSecret("blue kettle");
    expect(h).toMatch(/^scrypt\$16384\$8\$5\$[\w-]{22}\$[\w-]{43}$/);
    expect(await verifySecret("blue kettle", h)).toBe(true);
    expect(await verifySecret("blue kettlE", h)).toBe(false);
    expect(needsRehash(h)).toBe(false);
    const old = legacyHash("blue kettle");
    expect(await verifySecret("blue kettle", old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
  });

  it("refuses malformed hashes and digests that aren't 32 bytes, and never matches the stand-in", async () => {
    const [, N, r, p, salt, hash] = (await hashSecret("x")).split("$");
    expect(await verifySecret("x", `scrypt$${N}$${r}$${p}$${salt}$${hash.slice(0, 20)}`)).toBe(false);
    expect(await verifySecret("x", `scrypt$1000$8$5$${salt}$${hash}`)).toBe(false); // N not a power of two
    expect(await verifySecret("x", "bcrypt$whatever")).toBe(false);
    expect(await verifySecret("x", null)).toBe(false);
    expect(await verifySecret("", NO_HASH)).toBe(false);
  });

  it("compares tokens in constant time without ever throwing", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("é".repeat(22), "e".repeat(22))).toBe(false); // same length in characters, not in bytes
  });

  it("treats malformed or non-ASCII signed links as invalid, never a 500", async () => {
    expect(validOptOut(w.walkIn.id, "EMAIL", "é".repeat(22))).toBe(false);
    expect(readShare("PAT0001", { n: "Pat", s: "100", t: "GREEN", k: "ü".repeat(16) })).toBeNull();
    await putSnapshot("device-display", "abcdefabcdef", { v: 1 });
    expect(await getSnapshot("device-display", "ébcdefabcdef")).toBeNull();
    expect((await getSnapshot("device-display", "abcdefabcdef"))?.snapshot).toEqual({ v: 1 });
    const r = await run(reorderLink(new Request("http://localhost/r/x/y"), { params: Promise.resolve({ id: "x", token: "ø".repeat(43) }) }));
    expect(r.to).toBe("/cart");
  });
});

describe("Sessions", () => {
  it("takes a back-office session as a staff sign-in, but never a till's PIN session", async () => {
    const user = await db.user.findFirstOrThrow({ where: { storeId: w.store.id } });
    await db.session.create({ data: { id: sha256("office-token"), userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    await db.session.create({ data: { id: sha256("till-token"), userId: user.id, storeId: w.store.id, deviceId: "device-1", expiresAt: new Date(Date.now() + 3_600_000) } });
    jar.set(COOKIE.staff, "office-token");
    expect((await getStaff())?.id).toBe(user.id);
    jar.set(COOKIE.staff, "till-token");
    expect(await getStaff()).toBeNull();
  });

  it("isn't a staff sign-in until a temporary password is replaced (only the password page sees them)", async () => {
    const user = await db.user.findFirstOrThrow({ where: { storeId: w.store.id } });
    await db.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    jar.set(COOKIE.staff, "office-token");
    expect(await getStaff()).toBeNull();
    expect((await getStaffChangingPassword())?.id).toBe(user.id);
    await db.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
  });

  it("ends a staff session after 12 hours without use, refreshing the last use at most every 5 minutes", async () => {
    const id = sha256("office-token");
    const ago = (min: number) => new Date(Date.now() - min * 60_000);
    jar.set(COOKIE.staff, "office-token");
    await db.session.update({ where: { id }, data: { lastSeenAt: ago(2) } });
    expect(await getStaff()).not.toBeNull();
    expect((await db.session.findUniqueOrThrow({ where: { id } })).lastSeenAt.getTime()).toBeLessThan(ago(1).getTime()); // not touched
    await db.session.update({ where: { id }, data: { lastSeenAt: ago(6) } });
    expect(await getStaff()).not.toBeNull();
    expect((await db.session.findUniqueOrThrow({ where: { id } })).lastSeenAt.getTime()).toBeGreaterThan(ago(1).getTime()); // refreshed
    await db.session.update({ where: { id }, data: { lastSeenAt: ago(12 * 60 + 1) } });
    expect(await getStaff()).toBeNull();
  });

  it("ends a trade session after 12 hours without use too", async () => {
    const account = await db.tradeAccount.create({
      data: { number: "TA-900001", name: "Idle Co", legalName: "Idle Co (Pty) Ltd", email: "billing@idle.example", addressLine: "1 Street", city: "Pretoria", province: "GP", postalCode: "0083", status: "APPROVED" },
    });
    const buyer = await db.tradeBuyer.create({ data: { tradeAccountId: account.id, name: "Ida", email: "ida@idle.example" } });
    await db.session.create({ data: { id: sha256("trade-idle"), tradeBuyerId: buyer.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    expect((await tradeBuyerForToken("trade-idle"))?.id).toBe(buyer.id);
    await db.session.update({ where: { id: sha256("trade-idle") }, data: { lastSeenAt: new Date(Date.now() - 13 * 3_600_000) } });
    expect(await tradeBuyerForToken("trade-idle")).toBeNull();
  });

  it("purges expired sessions, day-old codes, old rate-limit rows and 90-day-old webhook ids daily", async () => {
    const days = (n: number) => new Date(Date.now() - n * 86_400_000);
    const user = await db.user.findFirstOrThrow({ where: { storeId: w.store.id } });
    await db.session.create({ data: { id: "expired-session", userId: user.id, expiresAt: days(1) } });
    await db.otp.create({ data: { phone: "+27825550999", codeHash: "x", expiresAt: days(2), createdAt: days(2) } });
    await db.throttle.create({ data: { key: "old-row", createdAt: days(3) } });
    await db.paymentEvent.createMany({ data: [{ gateway: "peach", eventId: "old", createdAt: days(91) }, { gateway: "peach", eventId: "new", createdAt: days(1) }] });
    const r = await purgeAuthRecords();
    expect(r).toMatchObject({ sessions: 1, codes: 1, throttle: 1, paymentEvents: 1 });
    expect(await db.session.count({ where: { id: sha256("office-token") } })).toBe(1);
    expect(await db.paymentEvent.findMany({ select: { eventId: true } })).toEqual([{ eventId: "new" }]);
  });
});

describe("Lockouts", () => {
  it("locks an account once after eight wrong passwords, however many arrive at once, until a right one clears it", async () => {
    const user = await db.user.findFirstOrThrow({ where: { storeId: w.store.id } });
    const locked = await Promise.all(Array.from({ length: 8 }, () => recordFailure(user.id, "password")));
    expect(locked.filter(Boolean)).toHaveLength(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(isLocked(after, "password")).toBe(true);
    expect(isLocked(after, "password", Date.now() + 16 * 60_000)).toBe(false);
    expect(isLocked(after, "pin")).toBe(false);
    await clearFailures(user.id, "password");
    expect(isLocked(await db.user.findUniqueOrThrow({ where: { id: user.id } }), "password")).toBe(false);
  });

  it("locks the tills after five wrong PINs", async () => {
    const user = await db.user.findFirstOrThrow({ where: { storeId: w.store.id } });
    const locked = [];
    for (let i = 0; i < 5; i++) locked.push(await recordFailure(user.id, "pin"));
    expect(locked).toEqual([false, false, false, false, true]);
    expect(isLocked(await db.user.findUniqueOrThrow({ where: { id: user.id } }), "pin")).toBe(true);
    await clearFailures(user.id, "pin");
  });
});

describe("Password sign-in", () => {
  const email = "sam@signin.example";
  const password = "rooibos on the stoep";
  let sam: { id: string };
  beforeAll(async () => {
    sam = await db.user.create({ data: { name: "Sam Signin", email, role: "MANAGER", storeId: w.store.id, companyId: w.owner.id, passwordHash: legacyHash(password) } });
  });

  it("counts a wrong password against the account and the connection, and audits it (not for unknown emails)", async () => {
    fromIp("203.0.113.10");
    const key = `signin-ip:${ipKey("203.0.113.10")}`;
    expect((await run(login({}, form({ email, password: "wrong password" })))).state).toEqual({ error: "That email and password don't match.", email });
    expect((await run(login({}, form({ email: "nobody@signin.example", password })))).state?.error).toBe("That email and password don't match.");
    expect(await db.throttle.count({ where: { key } })).toBe(2);
    expect(await audits("auth.failed", sam.id)).toBe(1);
    expect(await audits("auth.failed")).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: sam.id } })).passwordFails).toBe(1);
  });

  it("signs in with the right password and upgrades an older hash", async () => {
    fromIp("203.0.113.10");
    expect((await run(login({}, form({ email, password })))).to).toBe("/store/TST01");
    const u = await db.user.findUniqueOrThrow({ where: { id: sam.id } });
    expect(u.passwordFails).toBe(0);
    expect(needsRehash(u.passwordHash)).toBe(false);
    expect(await verifySecret(password, u.passwordHash)).toBe(true);
    expect(await db.session.count({ where: { id: sha256(jar.get(COOKIE.staff)!), userId: sam.id } })).toBe(1);
  });

  it("refuses everything from a connection with 30 failures in 15 minutes, before checking the password", async () => {
    const ip = "203.0.113.11";
    fromIp(ip);
    await db.throttle.createMany({ data: Array.from({ length: 29 }, () => ({ key: `signin-ip:${ipKey(ip)}` })) });
    expect((await run(login({}, form({ email, password: "still wrong" })))).state?.error).toBe("That email and password don't match.");
    expect((await run(login({}, form({ email, password })))).state).toEqual({ error: IP_LOCKED, email });
    await expect(verifyPairingUser(email, password)).rejects.toMatchObject({ status: 429, message: IP_LOCKED });
    fromIp("203.0.113.12");
    expect((await run(login({}, form({ email, password })))).to).toBe("/store/TST01");
  });

  it("refuses a temporary password once it has lapsed", async () => {
    fromIp("203.0.113.13");
    const temp = await db.user.create({
      data: { name: "Tia Temp", email: "tia@signin.example", role: "BUDTENDER", storeId: w.store.id, passwordHash: await hashSecret("Kq7m-Xp3t-Rw9z"), mustChangePassword: true, tempPasswordUntil: new Date(Date.now() + 3_600_000) },
    });
    expect((await run(login({}, form({ email: "tia@signin.example", password: "Kq7m-Xp3t-Rw9z" })))).to).toBe("/pos");
    await db.user.update({ where: { id: temp.id }, data: { tempPasswordUntil: new Date(Date.now() - 60_000) } });
    expect((await run(login({}, form({ email: "tia@signin.example", password: "Kq7m-Xp3t-Rw9z" })))).state?.error).toBe("Your temporary password has expired. Ask HQ or your store owner for a new one.");
  });

  it("lets the demo buttons and /api/auth/demo in only where the password is the demo one", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    fromIp("203.0.113.14");
    const demo = await db.user.create({ data: { name: "Dee Demo", email: "dee@signin.example", role: "MANAGER", storeId: w.store.id, passwordHash: await hashSecret(DEMO_PASSWORD) } });
    expect((await run(login({}, form({ email: "dee@signin.example", demo: "1" })))).to).toBe("/store/TST01");
    expect((await run(login({}, form({ email, demo: "1" })))).state?.error).toBe("That email and password don't match.");
    const via = (e: string) => demoSignIn(new Request(`http://localhost/api/auth/demo?email=${encodeURIComponent(e)}&next=/store/TST01`));
    expect((await via("dee@signin.example")).status).toBe(307);
    expect((await via(email)).status).toBe(404);
    vi.stubEnv("DEMO_MODE", "false");
    expect((await via(demo.email!)).status).toBe(404);
  });
});

describe("Till pairing and PINs", () => {
  it("won't pair with an account still on its temporary password", async () => {
    fromIp("203.0.113.20");
    await db.user.create({ data: { name: "Pat Pending", email: "pat@pair.example", role: "MANAGER", storeId: w.store.id, passwordHash: await hashSecret("Temp-Pass-4821"), mustChangePassword: true } });
    await expect(verifyPairingUser("pat@pair.example", "Temp-Pass-4821")).rejects.toMatchObject({ status: 403, message: "Choose your own password first: sign in at /login" });
    await expect(verifyPairingUser("pat@pair.example", "wrong")).rejects.toMatchObject({ status: 401 });
    expect(await audits("auth.failed")).toBeGreaterThan(0);
  });

  it("switches a PIN off after ten wrong in a day until a manager sets a new one", async () => {
    const device = await db.device.findUniqueOrThrow({ where: { id: w.device.id }, include: { store: true } });
    await db.user.update({ where: { id: w.budtender.id }, data: { pinHash: legacyHash("2580") } });
    // A right PIN signs in and upgrades the older hash.
    expect((await pinSignIn(device, w.budtender.id, "2580")).id).toBe(w.budtender.id);
    expect(needsRehash((await db.user.findUniqueOrThrow({ where: { id: w.budtender.id } })).pinHash)).toBe(false);
    // Nine wrong earlier today (across the 5-minute locks); the tenth switches it off.
    await db.throttle.createMany({ data: Array.from({ length: 9 }, () => ({ key: `pin:${w.budtender.id}` })) });
    await expect(pinSignIn(device, w.budtender.id, "1357")).rejects.toMatchObject({ status: 403, code: "PIN_DISABLED", message: PIN_DISABLED });
    expect(await audits("pos.pin_disabled", w.budtender.id)).toBe(1);
    await expect(pinSignIn(device, w.budtender.id, "2580")).rejects.toMatchObject({ status: 403, code: "PIN_DISABLED" }); // even the right one
    // The manager sets a new PIN at Store → Team.
    await signInAs(w.manager.id);
    expect((await resetPin(w.store.code, w.budtender.id, {}, form({ pin: "3691" }))).ok).toMatch(/New PIN set/);
    expect((await pinSignIn(device, w.budtender.id, "3691")).id).toBe(w.budtender.id);
  });
});

describe("Cross-site requests", () => {
  const req = (method: string, headers: Record<string, string>, url = "http://localhost/api/pos/sales") => new Request(url, { method, headers });
  const ok = async () => new Response("ok");

  it("refuses a change to the till from another site, but never a read", async () => {
    const handler = withDevice(ok);
    const res = await handler(req("POST", { "sec-fetch-site": "cross-site" }), {});
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "CROSS_SITE" });
    expect((await handler(req("POST", { origin: "https://evil.example" }), {})).status).toBe(403);
    expect((await handler(req("GET", { "sec-fetch-site": "cross-site" }), {})).status).toBe(401); // on to the device check
    expect((await open(ok)(req("POST", { "sec-fetch-site": "same-origin" }), {})).status).toBe(200);
    expect((await open(ok)(req("POST", { "sec-fetch-site": "same-site" }), {})).status).toBe(403);
  });

  it("only signs out from our own pages, and push renewal wants JSON from our own origin", async () => {
    const token = await signInAs(w.manager.id);
    expect((await logout(req("POST", { "sec-fetch-site": "cross-site" }, "http://localhost/logout"))).status).toBe(403);
    expect(await db.session.count({ where: { id: sha256(token) } })).toBe(1);
    expect((await logout(req("POST", { "sec-fetch-site": "same-origin" }, "http://localhost/logout"))).status).toBe(303);
    expect(await db.session.count({ where: { id: sha256(token) } })).toBe(0);
    expect((await renewPush(req("POST", { "sec-fetch-site": "cross-site", "content-type": "application/json" }, "http://localhost/api/push/renew"))).status).toBe(403);
    expect((await renewPush(req("POST", { "sec-fetch-site": "same-origin", "content-type": "text/plain" }, "http://localhost/api/push/renew"))).status).toBe(415);
  });
});

describe("Trade sign-in codes", () => {
  const buyerEmail = "bea@codes.example";
  beforeAll(async () => {
    const account = await db.tradeAccount.create({
      data: { number: "TA-900002", name: "Codes Co", legalName: "Codes Co (Pty) Ltd", email: "billing@codes.example", addressLine: "1 Street", city: "Pretoria", province: "GP", postalCode: "0083", status: "APPROVED" },
    });
    await db.tradeBuyer.create({ data: { tradeAccountId: account.id, name: "Bea", email: buyerEmail } });
  });

  it("issues a code and answers the same for anyone, but only emails a buyer", async () => {
    const buyer = await requestTradeCode(buyerEmail);
    const stranger = await requestTradeCode("stranger@codes.example");
    expect(buyer).toEqual({ email: buyerEmail, demoCode: undefined });
    expect(stranger).toEqual({ email: "stranger@codes.example", demoCode: undefined });
    expect(await db.otp.count({ where: { email: { in: [buyerEmail, "stranger@codes.example"] } } })).toBe(2);
    expect(await db.messageLog.count({ where: { to: buyerEmail } })).toBe(1);
    expect(await db.messageLog.count({ where: { to: "stranger@codes.example" } })).toBe(0);
  });

  it("treats any code for a stranger exactly like a buyer's wrong code, limits included", async () => {
    await expect(verifyTradeCode("stranger@codes.example", "123456")).rejects.toThrow("That code isn't right");
    await expect(verifyTradeCode(buyerEmail, "000000")).rejects.toThrow(/isn't right|expired/);
    expect((await db.otp.findFirstOrThrow({ where: { email: "stranger@codes.example" } })).attempts).toBe(1);
    for (let i = 0; i < 4; i++) await requestTradeCode("stranger@codes.example");
    await expect(requestTradeCode("stranger@codes.example")).rejects.toThrow("Too many codes requested. Try again in 10 minutes");
  });
});

describe("Someone else's ID number or email", () => {
  let idA: string;
  beforeAll(async () => {
    idA = saId("850101", "5009");
    await createCustomer({ phone: "+27825550400", firstName: "Ada", email: "ada@collide.example", idNumber: idA, consents: {}, source: "WEB", termsAccepted: true, homeStoreId: w.store.id }, { type: "SYSTEM" });
  });
  const join = (phone: string, extra: Record<string, string>) => {
    jar.set(SHOP_COOKIE.phone, signPhone(phone));
    return authFlow({ step: "register", phone }, form({ intent: "register", firstName: "Eve", idType: "id", homeStoreId: w.store.id, accept: "on", ...extra }));
  };

  it("joining: three collisions a day per phone, then nothing more is checked and the phone check is dropped", async () => {
    const phone = "+27825550401";
    for (let i = 0; i < 2; i++) expect((await join(phone, { idNumber: idA })).fields?.idNumber).toBe("That ID number is already linked to a member");
    expect((await join(phone, { idNumber: saId("900215", "5011"), email: "ada@collide.example" })).fields?.email).toBe("That email is already linked to another member");
    expect(await join(phone, { idNumber: idA })).toEqual({ step: "phone", error: COLLISION_REFUSED });
    expect(jar.has(SHOP_COOKIE.phone)).toBe(false);
    // Even a number nobody has gets no answer today.
    expect(await join(phone, { idNumber: saId("920304", "5022") })).toEqual({ step: "phone", error: COLLISION_REFUSED });
    expect(await db.customer.count({ where: { phone } })).toBe(0);
    // (JSON path filters don't exist on SQLite: the rows are few, so filter them here.)
    expect((await db.auditLog.findMany({ where: { action: "member.collision" }, select: { data: true } })).filter((a) => (a.data as { by?: string } | null)?.by === `phone:${phone}`)).toHaveLength(3);
    // Another phone isn't affected.
    expect((await join("+27825550402", { idNumber: saId("880808", "5033") })).step).toBe("done");
  });

  it("signed in: three ID-number collisions a day per member, then a store visit", async () => {
    await db.session.create({ data: { id: sha256("member-token"), customerId: w.walkIn.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    jar.set(COOKIE.customer, "member-token");
    for (let i = 0; i < 3; i++) expect((await verifyAgeWithId({}, form({ idNumber: idA }))).error).toMatch(/already linked to another member/);
    expect(await verifyAgeWithId({}, form({ idNumber: idA }))).toEqual({ error: COLLISION_REFUSED });
    expect(await audits("member.collision", w.walkIn.id)).toBe(3);
  });
});

describe("Choosing and setting passwords", () => {
  it("changing your own: the policy, and wrong current passwords count towards the lockout", async () => {
    const pw = "a long walk on the beach";
    const u = await db.user.create({
      data: { name: "Cara Change", email: "cara@pw.example", role: "MANAGER", storeId: w.store.id, passwordHash: await hashSecret(pw), mustChangePassword: true, tempPasswordUntil: new Date(Date.now() + 3_600_000), passwordFails: 6 },
    });
    await signInAs(u.id);
    const change = (current: string, next: string, confirm = next) => run(changePassword({}, form({ current, next, confirm })));
    expect((await change(pw, "password123")).state).toEqual({ error: "That's one of the most common passwords. Choose something harder to guess.", field: "next" });
    expect((await change(pw, "cara's new password")).state?.field).toBe("next"); // her name
    expect((await change("not it", "a fresh new password")).state?.field).toBe("current");
    expect((await change("not it either", "a fresh new password")).state?.field).toBe("current"); // the eighth: locked
    expect((await change(pw, "a fresh new password")).state?.error).toMatch(/Too many wrong passwords/);
    await clearFailures(u.id, "password");
    expect((await change(pw, "a fresh new password")).to).toBe("/store/TST01");
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({ mustChangePassword: false, tempPasswordUntil: null });
    expect(await verifySecret("a fresh new password", after.passwordHash)).toBe(true);
  });

  it("HQ hands out temporary passwords that lapse", async () => {
    const admin = await db.user.create({ data: { name: "Hana Admin", email: "hana@hq.example", role: "HQ_ADMIN", companyId: w.hq.id, passwordHash: await hashSecret("hq admin passphrase") } });
    await signInAs(admin.id);
    const added = await addUser({}, form({ name: "Nico New", email: "nico@hq.example", role: "HQ_STAFF" }));
    const temp = added.ok?.match(/temporary password\s+(\S+)\s+\(/)?.[1];
    expect(temp).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    const nico = await db.user.findUniqueOrThrow({ where: { email: "nico@hq.example" } });
    expect(nico.mustChangePassword).toBe(true);
    expect(nico.tempPasswordUntil!.getTime()).toBeGreaterThan(Date.now() + 71 * 3_600_000);
    expect(await verifySecret(temp!, nico.passwordHash)).toBe(true);
    const reset = await hqResetPassword(nico.id, {});
    expect(reset.ok?.match(/:\s+(\S+)\s+\(/)?.[1]).not.toBe(temp);
  });

  it("a store's owner or manager sets temporary passwords too, under the same policy", async () => {
    await signInAs(w.manager.id);
    const add = (password: string) => addStaff(w.store.code, {}, form({ name: "Bo Budtender", role: "BUDTENDER", pin: "2580", email: "bo@store.example", password }));
    expect((await add("password123")).fields?.password).toMatch(/most common/);
    expect((await add("Bo Budtender's password")).fields?.password).toBe("Leave names out of the password.");
    expect((await add("green kettle on the stoep")).ok).toMatch(/choose their own the first time/);
    const bo = await db.user.findUniqueOrThrow({ where: { email: "bo@store.example" } });
    expect(bo.mustChangePassword).toBe(true);
    expect(bo.tempPasswordUntil).not.toBeNull();
    await db.session.create({ data: { id: "bo-office", userId: bo.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    await db.session.create({ data: { id: "bo-till", userId: bo.id, deviceId: w.device.id, storeId: w.store.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    const reset = await storeResetPassword(w.store.code, bo.id, {}, form({}));
    const temp = reset.ok?.match(/:\s+(\S+)\s+\(/)?.[1];
    expect(await verifySecret(temp!, (await db.user.findUniqueOrThrow({ where: { id: bo.id } })).passwordHash)).toBe(true);
    expect((await db.session.findMany({ where: { userId: bo.id }, select: { id: true } })).map((s) => s.id)).toEqual(["bo-till"]);
    expect((await storeResetPassword(w.store.code, w.manager.id, {}, form({}))).error).toMatch(/no back-office login/);
  });
});
