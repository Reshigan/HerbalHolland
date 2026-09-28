// Reads a shared Rewards card from the URL. The snapshot is signed (server/share.ts): no member lookup, nothing
// to probe, and never anything the member bought. An invalid or tampered link falls back to the generic brand card.
import { readShare } from "@/server/share";
import { TIERS } from "@/lib/loyalty-rules";
import { zarWhole } from "@/lib/money";

export type ShareQuery = { n?: string | string[]; s?: string | string[]; t?: string | string[]; k?: string | string[] };
const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);

export function shareCard(ref: string, q: ShareQuery) {
  const sp = { n: one(q.n), s: one(q.s), t: one(q.t), k: one(q.k) };
  const card = /^[A-Za-z0-9-]{3,32}$/.test(ref) ? readShare(ref, sp) : null;
  const tier = card && TIERS.find((t) => t.key === card.tier);
  if (!card || !tier || !card.firstName || !Number.isFinite(card.savedCents)) return null;
  const saved = card.savedCents >= 100 ? zarWhole(Math.floor(card.savedCents / 100) * 100) : null; // whole rands, never rounded up
  return {
    ...card,
    tierName: tier.name,
    tierIndex: TIERS.indexOf(tier),
    saved,
    /** What the card says, first person (for the image) and third person (for the page). */
    headline: saved ? `I've saved ${saved}` : `I'm a ${tier.name} member`,
    about: saved ? `${card.firstName} has saved ${saved} with Herbal Holland Rewards` : `${card.firstName} is a ${tier.name} member of Herbal Holland Rewards`,
    query: new URLSearchParams({ n: sp.n!, s: sp.s!, t: sp.t!, k: sp.k! }).toString(),
  };
}
export type ShareCard = NonNullable<ReturnType<typeof shareCard>>;
