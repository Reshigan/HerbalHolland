// Replenishment maths: suggested order quantity per ranged SKU.
export type ReplenishInput = {
  available: number;
  onOrder: number;
  reorderPoint: number;
  parLevel: number;
  avgDaily: number; // trailing 28-day average units/day
  leadDays?: number;
  coverDays?: number;
  packSize?: number;
};

export function suggestQty(i: ReplenishInput) {
  const lead = i.leadDays ?? 3;
  const cover = i.coverDays ?? 14;
  const position = i.available + i.onOrder;
  const trigger = Math.max(i.reorderPoint, Math.ceil(i.avgDaily * lead));
  if (position > trigger) return 0;
  const target = Math.max(i.parLevel, Math.ceil(i.avgDaily * (lead + cover)));
  const need = Math.max(0, target - position);
  const pack = i.packSize ?? 1;
  return Math.ceil(need / pack) * pack;
}

export const daysOfCover = (available: number, avgDaily: number) => (avgDaily > 0 ? available / avgDaily : Infinity);
