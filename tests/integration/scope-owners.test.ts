// Franchisee owner sign-ins on HQ → Stores → <store>: only the HQ administrator adds owners, resets their passwords
// and deactivates them; each change is audited and signs the owner out; a trading company keeps one active owner.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));

import { db } from "@/server/db";
import { sha256, verifySecret } from "@/server/crypto";
import { COOKIE } from "@/server/auth";
import { TEMP_PASSWORD_HOURS } from "@/server/passwords";
import { addOwner, resetOwnerPassword, setOwnerActive } from "@/app/hq/stores/[code]/actions";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let admin: { id: string }, team: { id: string }, rivalOwner: { id: string };
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
let n = 0;
async function session(userId: string) {
  const token = `scope-owners-${userId}-${++n}`;
  await db.session.create({ data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + 3_600_000) } });
  return token;
}
const signIn = async (u: { id: string }) => void jar.set(COOKIE.staff, await session(u.id));
const DENIED = { error: "You don't have permission to do that." };
const flashed = (text: string) => ({ digest: expect.stringContaining(encodeURIComponent(text)) });
const passwordIn = (msg: string | undefined) => /(?:temporary password|:)\s+(\S+)\s+\(/.exec(msg ?? "")?.[1] ?? "";

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  admin = await db.user.create({ data: { name: "Hanna Admin", role: "HQ_ADMIN", companyId: w.hq.id, email: "hanna@owners.example" } });
  team = await db.user.create({ data: { name: "Sam Team", role: "HQ_STAFF", companyId: w.hq.id, email: "sam@owners.example" } });
  const rival = await db.company.create({ data: { kind: "FRANCHISEE", name: "Other Retail", legalName: "Other Retail (Pty) Ltd", email: "other@example.co.za" } });
  rivalOwner = await db.user.create({ data: { name: "Rita Rival", role: "OWNER", companyId: rival.id, email: "rita@owners.example" } });
});
afterAll(() => db.$disconnect());

describe("Franchisee owner sign-ins", () => {
  let nandi: string;
  let firstPassword: string;

  it("are the HQ administrator's alone to manage", async () => {
    await signIn(team);
    expect(await addOwner(w.store.id, {}, form({ name: "Nandi Owner", email: "nandi@owners.example" }))).toMatchObject(DENIED);
    expect(await resetOwnerPassword(w.store.id, rivalOwner.id, {})).toMatchObject(DENIED);
    expect(await setOwnerActive(w.store.id, rivalOwner.id, false, {})).toMatchObject(DENIED);
    expect(await db.user.count({ where: { role: "OWNER" } })).toBe(1);
  });

  it("adds an owner of the store's company with a temporary password, shown once and audited", async () => {
    await signIn(admin);
    expect(await addOwner(w.store.id, {}, form({ name: "N", email: "nope" }))).toMatchObject({ fields: { name: "Their full name", email: "The email address they'll sign in with" } });
    const r = await addOwner(w.store.id, {}, form({ name: "Nandi Owner", email: "Nandi@Owners.example" }));
    firstPassword = passwordIn(r.ok);
    expect(firstPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);
    const u = await db.user.findUniqueOrThrow({ where: { email: "nandi@owners.example" } });
    nandi = u.id;
    expect(u).toMatchObject({ role: "OWNER", companyId: w.owner.id, storeId: null, mustChangePassword: true, active: true });
    expect(u.tempPasswordUntil!.getTime() - Date.now()).toBeGreaterThan((TEMP_PASSWORD_HOURS - 1) * 3_600_000);
    expect(await verifySecret(firstPassword, u.passwordHash)).toBe(true);
    expect(await db.auditLog.findFirst({ where: { action: "user.create", entityId: u.id } })).toMatchObject({ actorId: admin.id, storeId: w.store.id, data: { email: "nandi@owners.example", role: "OWNER" } });
    expect(await addOwner(w.store.id, {}, form({ name: "Nandi Again", email: "nandi@owners.example" }))).toMatchObject({ fields: { email: "Someone already signs in with this email" } });
  });

  it("resets a password: a new temporary one, signed out everywhere, audited, and only for this company's owners", async () => {
    await session(nandi);
    const r = await resetOwnerPassword(w.store.id, nandi, {});
    const next = passwordIn(r.ok);
    expect(next).toBeTruthy();
    expect(next).not.toBe(firstPassword);
    const u = await db.user.findUniqueOrThrow({ where: { id: nandi } });
    expect(await verifySecret(next, u.passwordHash)).toBe(true);
    expect(await verifySecret(firstPassword, u.passwordHash)).toBe(false);
    expect(u.mustChangePassword).toBe(true);
    expect(await db.session.count({ where: { userId: nandi } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "user.password_reset", entityId: nandi } })).toBe(1);
    expect(await resetOwnerPassword(w.store.id, rivalOwner.id, {})).toMatchObject({ error: "Owner not found." });
    expect(await resetOwnerPassword(w.store.id, w.manager.id, {})).toMatchObject({ error: "Owner not found." });
  });

  it("deactivates an owner (signed out everywhere), but a company with a trading store keeps one active", async () => {
    const second = await db.user.create({ data: { name: "Olga Owner", role: "OWNER", companyId: w.owner.id, email: "olga@owners.example" } });
    await session(second.id);
    await expect(setOwnerActive(w.store.id, second.id, false, {})).rejects.toMatchObject(flashed("Olga Owner has been signed out everywhere"));
    expect(await db.user.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ active: false });
    expect(await db.session.count({ where: { userId: second.id } })).toBe(0);
    // Nandi is the last active owner, and Test Store is trading.
    expect(await setOwnerActive(w.store.id, nandi, false, {})).toMatchObject({ error: expect.stringContaining("keeps at least one active owner") });
    expect((await db.user.findUniqueOrThrow({ where: { id: nandi } })).active).toBe(true);
    // Once the company has no trading store, its last owner can go too.
    await db.store.update({ where: { id: w.store.id }, data: { status: "OPENING_SOON" } });
    await expect(setOwnerActive(w.store.id, nandi, false, {})).rejects.toMatchObject(flashed("Nandi Owner has been signed out everywhere"));
    await expect(setOwnerActive(w.store.id, second.id, true, {})).rejects.toMatchObject(flashed("Olga Owner can sign in again."));
    expect((await db.user.findUniqueOrThrow({ where: { id: second.id } })).active).toBe(true);
    await db.store.update({ where: { id: w.store.id }, data: { status: "ACTIVE" } });
    const audit = await db.auditLog.findMany({ where: { entityId: { in: [nandi, second.id] }, action: { in: ["user.deactivate", "user.reactivate"] } }, select: { action: true } });
    expect(audit.map((a) => a.action).sort()).toEqual(["user.deactivate", "user.deactivate", "user.reactivate"]);
    expect(await setOwnerActive(w.store.id, rivalOwner.id, false, {})).toMatchObject({ error: "Owner not found." });
  });
});
