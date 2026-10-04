// Sign-in hardening: one-time codes hold their limits under concurrent requests, and a till's PIN session is never a
// back-office sign-in.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The request's cookies, as the session readers see them.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));

import { db } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { checkCode, issueCode } from "@/server/otp";
import { COOKIE, getStaff, getStaffChangingPassword } from "@/server/auth";
import { clearFailures, isLocked, recordFailure } from "@/server/lockout";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterAll(() => db.$disconnect());

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
  });
});
