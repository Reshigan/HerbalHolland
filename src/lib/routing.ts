// Omnichannel order routing: pick the fulfilling location for an online order.
export type Fulfil = "COLLECT" | "SAME_DAY" | "COURIER";
export type RouteCandidate = {
  id: string;
  name: string;
  kind: "RETAIL" | "WAREHOUSE";
  city: string;
  province: string;
  lat?: number | null;
  lng?: number | null;
  sameDay: boolean;
  clickCollect: boolean;
  active: boolean;
  licences?: string[];
  available: Record<string, number>; // variantId → sellable qty
};
export type RouteRequest = {
  fulfilment: Fulfil;
  lines: { variantId: string; qty: number }[];
  storeId?: string | null;
  city?: string | null;
  province?: string | null;
  lat?: number | null;
  lng?: number | null;
  requiredLicences?: string[]; // e.g. ["THC"] when the basket holds licensed products
};
export type RouteResult =
  | { ok: true; storeId: string; reason: string }
  | { ok: false; reason: string; alternatives: { id: string; name: string }[] };

const canFill = (c: RouteCandidate, lines: RouteRequest["lines"]) => lines.every((l) => (c.available[l.variantId] ?? 0) >= l.qty);

/**
 * The fulfilment options checkout offers: only what some store can serve. Click & collect needs a trading (ACTIVE)
 * retail store that takes collections, same-day a trading retail store with its own drivers. Courier is always on offer
 * (it ships from a distribution centre first). Before the first store opens that leaves delivery only.
 */
export function offeredFulfilment(stores: Pick<RouteCandidate, "kind" | "active" | "clickCollect" | "sameDay">[]): { options: Fulfil[]; deliveryOnly: boolean } {
  const trading = stores.filter((s) => s.kind === "RETAIL" && s.active);
  const options: Fulfil[] = [...(trading.some((s) => s.clickCollect) ? ["COLLECT" as const] : []), ...(trading.some((s) => s.sameDay) ? ["SAME_DAY" as const] : []), "COURIER"];
  return { options, deliveryOnly: options.length === 1 };
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function proximity(c: RouteCandidate, r: RouteRequest) {
  if (r.lat != null && r.lng != null && c.lat != null && c.lng != null) return distanceKm({ lat: r.lat, lng: r.lng }, { lat: c.lat, lng: c.lng });
  const sameCity = r.city && c.city.toLowerCase() === r.city.toLowerCase();
  return sameCity ? 0 : c.province === r.province ? 100 : 1000;
}

export function routeOrder(req: RouteRequest, candidates: RouteCandidate[]): RouteResult {
  const need = req.requiredLicences ?? [];
  const live = candidates.filter((c) => c.active && need.every((l) => c.licences?.includes(l)));
  const fillable = live.filter((c) => canFill(c, req.lines));
  const nearest = (xs: RouteCandidate[]) => [...xs].sort((a, b) => proximity(a, req) - proximity(b, req));
  const alts = (xs: RouteCandidate[]) => nearest(xs).slice(0, 3).map((c) => ({ id: c.id, name: c.name }));

  if (req.fulfilment === "COLLECT") {
    const chosen = live.find((c) => c.id === req.storeId);
    if (chosen && chosen.clickCollect && canFill(chosen, req.lines)) return { ok: true, storeId: chosen.id, reason: "Member's chosen store" };
    return { ok: false, reason: "Not everything is in stock at that store", alternatives: alts(fillable.filter((c) => c.kind === "RETAIL" && c.clickCollect)) };
  }

  if (req.fulfilment === "SAME_DAY") {
    const pool = nearest(fillable.filter((c) => c.kind === "RETAIL" && c.sameDay && proximity(c, req) <= 30));
    if (pool[0]) return { ok: true, storeId: pool[0].id, reason: `Nearest same-day store with full stock (${pool[0].name})` };
    return { ok: false, reason: "No same-day store near you has everything in stock", alternatives: [] };
  }

  // Courier: distribution centre first (cheapest pick), then ship-from-store nearest the customer.
  const dcs = nearest(fillable.filter((c) => c.kind === "WAREHOUSE"));
  if (dcs[0]) return { ok: true, storeId: dcs[0].id, reason: `Ships from ${dcs[0].name}` };
  const stores = nearest(fillable.filter((c) => c.kind === "RETAIL"));
  if (stores[0]) return { ok: true, storeId: stores[0].id, reason: `Ship-from-store: ${stores[0].name}` };
  return { ok: false, reason: "Out of stock across the network", alternatives: [] };
}
