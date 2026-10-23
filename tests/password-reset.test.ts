import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/db", () => ({ db: { user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "u1" ? { id: "u1", active: true, passwordHash: "h1" } : null)) } } }));
vi.mock("@/server/email", () => ({ sendEmail: vi.fn(), emailLayout: () => "", esc: (s: string) => s }));
vi.mock("@/server/audit", () => ({ audit: vi.fn() }));
import { readReset, signReset } from "@/server/password-reset";

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
});
