// Who sees what in HQ → Trade. HQ admin and the HQ team see every account and order and may act on them; an area
// manager sees (read-only) the orders their region's stores fulfil and the accounts that order from, or are served by
// a DC in, their region (the same rule the trade reports and the overview's queue use).
import { HQ_ROLES, requireStaff } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { can } from "@/server/hq/guard";
import type { Prisma } from "@/generated/prisma/client";

export async function tradeScope() {
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const networkWide = scope.kind === "HQ";
  const ids = networkWide ? [] : await scopedStoreIds(scope);
  return { user, scope, networkWide, ids, canEdit: can(user, "network"), isAdmin: can(user, "admin") };
}
export type TradeScope = Awaited<ReturnType<typeof tradeScope>>;

export const accountWhere = (s: Pick<TradeScope, "networkWide" | "ids">): Prisma.TradeAccountWhereInput =>
  s.networkWide ? {} : { OR: [{ orders: { some: { storeId: { in: s.ids } } } }, { sales: { some: { storeId: { in: s.ids } } } }, { dcId: { in: s.ids } }] };

export const orderWhere = (s: Pick<TradeScope, "networkWide" | "ids">): Prisma.TradeOrderWhereInput => (s.networkWide ? {} : { storeId: { in: s.ids } });
