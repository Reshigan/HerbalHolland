// Store network table: rollup-backed trading KPIs for up to ~1,000 stores. Only the
// light store rows and one grouped rollup per period are loaded; member counts are
// fetched for the visible page only.
import { db } from "@/server/db";
import { salesByStore } from "@/server/finance";
import { resolveRange, previousRange, delta } from "@/lib/ranges";
import type { Prisma, StoreFormat, StoreKind, StoreStatus } from "@/generated/prisma/client";

export type StoreFilters = { q?: string; region?: string; format?: string; status?: string; kind?: string; sort?: string };

export const FORMATS: StoreFormat[] = ["FLAGSHIP", "STANDARD", "EXPRESS"];
export const STATUSES: StoreStatus[] = ["ACTIVE", "OPENING_SOON", "CLOSED"];
export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll("_", " ");

export function storeFilterWhere(ids: string[], f: StoreFilters): Prisma.StoreWhereInput {
  const kind: StoreKind = f.kind === "WAREHOUSE" ? "WAREHOUSE" : "RETAIL";
  const q = f.q?.trim();
  return {
    AND: [
      { id: { in: ids }, kind },
      f.region ? { region: { code: f.region } } : {},
      f.format && FORMATS.includes(f.format as StoreFormat) ? { format: f.format as StoreFormat } : {},
      f.status && STATUSES.includes(f.status as StoreStatus) ? { status: f.status as StoreStatus } : {},
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
              { suburb: { contains: q, mode: "insensitive" } },
              { company: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
}

export async function storeTable(ids: string[], f: StoreFilters, page: number, pageSize: number) {
  const r = resolveRange({ range: "30d" });
  const prev = previousRange(r);
  const stores = await db.store.findMany({
    where: storeFilterWhere(ids, f),
    select: {
      id: true, code: true, name: true, city: true, suburb: true, status: true, format: true, openedAt: true,
      region: { select: { code: true, name: true } },
      company: { select: { id: true, name: true, vatNumber: true } },
    },
  });
  const sid = stores.map((s) => s.id);
  const [cur, before] = await Promise.all([salesByStore(sid, r), salesByStore(sid, prev)]);
  const rows = stores.map((s) => {
    const c = cur.get(s.id);
    const p = before.get(s.id);
    return { ...s, netCents: c?.netCents ?? 0, atvCents: c?.atvCents ?? 0, tx: c?.sales ?? 0, growth: delta(c?.netCents ?? 0, p?.netCents ?? 0) };
  });
  const sorters: Record<string, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    sales: (a, b) => b.netCents - a.netCents,
    growth: (a, b) => (b.growth ?? -Infinity) - (a.growth ?? -Infinity),
    atv: (a, b) => b.atvCents - a.atvCents,
    name: (a, b) => a.name.localeCompare(b.name),
    code: (a, b) => a.code.localeCompare(b.code),
  };
  rows.sort(sorters[f.sort ?? ""] ?? sorters.sales);
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const members = await db.customer.groupBy({ by: ["homeStoreId"], where: { homeStoreId: { in: slice.map((s) => s.id) } }, _count: true });
  const byStore = new Map(members.map((m) => [m.homeStoreId, m._count]));
  const totals = rows.reduce((t, s) => ({ net: t.net + s.netCents, tx: t.tx + s.tx }), { net: 0, tx: 0 });
  return {
    range: r,
    total: rows.length,
    totals,
    trading: rows.filter((s) => s.status === "ACTIVE").length,
    opening: rows.filter((s) => s.status === "OPENING_SOON").length,
    rows: slice.map((s) => ({ ...s, members: byStore.get(s.id) ?? 0 })),
  };
}
