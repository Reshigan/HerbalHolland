// An owner links their own card from the member app: only with both sign-ins, only an analytics role, never over a link.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ customer: null as unknown, staff: null as unknown, holder: null as unknown, update: vi.fn(), audit: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/server/auth", () => ({ getCustomer: async () => state.customer, getStaff: async () => state.staff, getStaffChangingPassword: async () => state.staff, requireStaff: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { user: { findUnique: async () => state.holder, update: state.update } }, Prisma: {} }));
vi.mock("@/server/audit", () => ({ audit: state.audit }));
vi.mock("@/server/hq/guard", () => ({ actorOf: (u: { id: string }) => u }));
vi.mock("@/server/customers", () => ({}));
vi.mock("@/server/push", () => ({}));
vi.mock("@/server/shop/context", () => ({ HOME_STORE_STATUSES: [] }));
vi.mock("@/server/partners", () => ({}));

import { linkOwnerCard } from "@/app/club/actions";

const owner = { id: "u1", name: "Owner", role: "OWNER", memberId: null };

describe("linkOwnerCard", () => {
  beforeEach(() => {
    Object.assign(state, { customer: { id: "c1", memberNo: "HH0000001" }, staff: owner, holder: null });
    state.update.mockClear();
    state.audit.mockClear();
  });

  it("links an owner's card and records it", async () => {
    await linkOwnerCard();
    expect(state.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { memberId: "c1" } });
    expect(state.audit).toHaveBeenCalledOnce();
  });

  it.each([
    ["no staff sign-in", { staff: null }],
    ["no member sign-in", { customer: null }],
    ["a role without analytics", { staff: { ...owner, role: "BUDTENDER" } }],
    ["an owner who already has a card", { staff: { ...owner, memberId: "c9" } }],
    ["a card someone else holds", { holder: { id: "u2" } }],
  ])("does nothing for %s", async (_, patch) => {
    Object.assign(state, patch);
    await linkOwnerCard();
    expect(state.update).not.toHaveBeenCalled();
  });
});
