import { describe, expect, it, vi } from "vitest";
const { users } = vi.hoisted(() => ({
  users: {
    u1: { id: "u1", active: true, passwordHash: "h1" as string | null, email: "a@x.za", name: "A" },
    pin: { id: "pin", active: true, passwordHash: null as string | null, email: "pin@x.za", name: "P" },
  } as Record<string, { id: string; active: boolean; passwordHash: string | null; email: string | null; name: string }>,
}));
vi.mock("@/server/db", () => ({ db: {
  user: {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) => (where.id ? users[where.id] : Object.values(users).find((u) => u.email === where.email)) ?? null,
    updateMany: async ({ where }: { where: { id: string; passwordHash: string | null } }) => ({ count: users[where.id]?.passwordHash === where.passwordHash ? 1 : 0 }),
  },
  session: { deleteMany: async () => ({ count: 0 }) },
} }));
vi.mock("@/server/background", () => ({ background: vi.fn() }));
vi.mock("@/server/graph-mail", () => ({ graphConfigured: () => true }));
vi.mock("@/server/crypto", () => ({ hashSecret: async (s: string) => "hash:" + s, sha256: (s: string) => "sha:" + s }));
vi.mock("@/server/email", () => ({ sendEmail: vi.fn(), emailLayout: () => "", esc: (s: string) => s }));
vi.mock("@/server/audit", () => ({ audit: vi.fn() }));
import { background } from "@/server/background";
import { completeReset, readReset, requestReset, signReset } from "@/server/password-reset";

describe("password reset links", () => {
  it("open the account while fresh and the password is unchanged", async () => {
    const t = signReset({ id: "u1", passwordHash: "h1" }, 1_000);
    expect((await readReset(t, 2_000))?.id).toBe("u1");
  });
  it("stop working when expired, tampered, or once the password changed", async () => {
    const t = signReset({ id: "u1", passwordHash: "h1" }, 1_000);
    expect(await readReset(t, 1_000 + 31 * 60_000)).toBeNull();
    expect(await readReset(t.slice(0, -2) + "xx", 2_000)).toBeNull();
    expect(await readReset(signReset({ id: "u1", passwordHash: "old" }, 1_000), 2_000)).toBeNull(); // the hash moved on
    expect(await readReset(signReset({ id: "u2", passwordHash: "h1" }, 1_000), 2_000)).toBeNull(); // no such account
  });
  it("only go to accounts that already sign in with a password", async () => {
    await requestReset("pin@x.za");
    expect(background).not.toHaveBeenCalled();
    await requestReset("a@x.za");
    expect(background).toHaveBeenCalledTimes(1);
  });
  it("take only once: the second of two links used together finds the password already changed", async () => {
    const u = { id: "u1", name: "A", storeId: null, passwordHash: "h1" };
    expect(await completeReset(u, "first-new-password")).toBe(true);
    users.u1.passwordHash = "hash:first-new-password";
    expect(await completeReset(u, "second-new-password")).toBe(false);
  });
});
