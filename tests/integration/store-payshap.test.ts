// The store's PayShap ShapID: whoever manages the store sets it in the store's settings (audited, checked loosely), and
// the till gets it with the store's data, so it offers PayShap only where the store's bank has issued one.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The request's cookies, as the session readers see them; server actions' cache calls do nothing here.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));

import { db } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { COOKIE } from "@/server/auth";
import { buildBootstrap } from "@/server/pos/bootstrap";
import type { PosDevice } from "@/server/pos/http";
import { saveStoreDetails } from "@/app/store/[code]/settings/actions";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let n = 0;
async function signIn(u: { id: string }) {
  const token = `payshap-${u.id}-${++n}`;
  await db.session.create({ data: { id: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  jar.set(COOKIE.staff, token);
}
/** The details form as the page posts it (every day closed, click & collect on), with this ShapID. */
function details(payshapId: string) {
  const fd = new FormData();
  for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) fd.set(`closed:${d}`, "on");
  fd.set("clickCollect", "on");
  fd.set("payshapId", payshapId);
  return fd;
}
const shapIdOf = async () => (await db.store.findUniqueOrThrow({ where: { id: w.store.id } })).payshapId;
const lastAudit = () => db.auditLog.findFirst({ where: { action: "store.settings", entityId: w.store.id }, orderBy: { at: "desc" } });
const tillShapId = async () => (await buildBootstrap({ ...w.device, store: w.store } as PosDevice, "http://localhost")).store.payshapId;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterAll(() => db.$disconnect());

describe("Store settings: the PayShap ShapID", () => {
  it("starts unset, so the till has none to offer", async () => {
    expect(await shapIdOf()).toBeNull();
    expect(await tillShapId()).toBeNull();
  });

  it("is saved by the manager (trimmed), audited with what it was, and sent to the till", async () => {
    await signIn(w.manager);
    const r = await saveStoreDetails("TST01", {}, details("  tst01@examplebank "));
    expect(r.error).toBeUndefined();
    expect(r.ok).toContain("Store details saved.");
    expect(r.ok).toContain("ShapID");
    expect(await shapIdOf()).toBe("tst01@examplebank");
    expect((await lastAudit())?.data).toMatchObject({ payshap: "tst01@examplebank", payshapBefore: null });
    expect(await tillShapId()).toBe("tst01@examplebank");
  });

  it("is checked loosely: too long is refused on its field, and nothing changes", async () => {
    await signIn(w.manager);
    const r = await saveStoreDetails("TST01", {}, details(`${"x".repeat(55)}@bank1`));
    expect(r.fields?.payshapId).toMatch(/60 characters/);
    expect(await shapIdOf()).toBe("tst01@examplebank");
  });

  it("is cleared to switch PayShap off", async () => {
    await signIn(w.manager);
    const r = await saveStoreDetails("TST01", {}, details(""));
    expect(r.error).toBeUndefined();
    expect(await shapIdOf()).toBeNull();
    expect((await lastAudit())?.data).toMatchObject({ payshap: null, payshapBefore: "tst01@examplebank" });
    expect(await tillShapId()).toBeNull();
  });

  it("can't be set by someone who can't manage the store", async () => {
    await signIn(w.budtender);
    const r = await saveStoreDetails("TST01", {}, details("mine@mybank"));
    expect(r.error).toBeTruthy();
    expect(await shapIdOf()).toBeNull();
  });
});
