// First-expiry-first-out allocation across batch lots. Also yields FIFO cost.
export type Lot = {
  batchId: string;
  onHand: number;
  unitCostCents: number;
  sellable: boolean;
  expiresAt?: Date | null;
  packedAt: Date;
};
export type Allocation = { batchId: string; qty: number; unitCostCents: number };

export function fefoOrder<T extends Lot>(lots: T[]) {
  return [...lots].sort((a, b) => {
    const ea = a.expiresAt?.getTime() ?? Infinity;
    const eb = b.expiresAt?.getTime() ?? Infinity;
    return ea - eb || a.packedAt.getTime() - b.packedAt.getTime();
  });
}

/** Allocates `qty` units from sellable lots. `short` is what could not be covered. */
export function allocate(lots: Lot[], qty: number): { allocations: Allocation[]; short: number } {
  const allocations: Allocation[] = [];
  let need = qty;
  for (const lot of fefoOrder(lots.filter((l) => l.sellable && l.onHand > 0))) {
    if (need <= 0) break;
    const take = Math.min(need, lot.onHand);
    allocations.push({ batchId: lot.batchId, qty: take, unitCostCents: lot.unitCostCents });
    need -= take;
  }
  return { allocations, short: need };
}

export const allocationCost = (a: Allocation[]) => a.reduce((s, x) => s + x.qty * x.unitCostCents, 0);
