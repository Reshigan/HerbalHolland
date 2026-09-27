// Print-on-demand partner adapter (made-to-order merch, see merch.ts).
//   POD_PROVIDER=log (default)  records what would be sent and never progresses — development and demos.
// A live partner implements `submit` (create the order with our print files) and `state` (production/shipping).

export type PodItem = { sku: string; qty: number; name: string; files: { placement: "front" | "back"; url: string }[] };
export type PodOrder = {
  ref: string; // our order code
  recipient: { name: string; phone: string; email: string | null; addressLine: string; suburb: string; city: string; province: string; postalCode: string; notes: string | null };
  items: PodItem[];
};
export type PodState = { status: "submitted" | "in_production" | "shipped" | "delivered" | "cancelled"; courier?: string; trackingNo?: string };
export type PodProvider = { submit(o: PodOrder): Promise<{ id: string }>; state(id: string): Promise<PodState> };

const log: PodProvider = {
  async submit(o) {
    console.info("[pod:log] order", o.ref, JSON.stringify(o.items.map((i) => ({ sku: i.sku, qty: i.qty, files: i.files.length }))));
    return { id: `LOG-${o.ref}` };
  },
  async state() {
    return { status: "submitted" };
  },
};

const PROVIDERS: Record<string, () => PodProvider> = { log: () => log };

export function pod(): PodProvider {
  const name = process.env.POD_PROVIDER ?? "log";
  const make = PROVIDERS[name];
  if (!make) throw new Error(`Unknown POD_PROVIDER "${name}"`);
  return make();
}
