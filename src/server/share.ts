// Shareable Rewards cards ("I saved R742 with Herbal Holland Rewards"). The member's snapshot travels in a signed URL,
// so the card needs no lookup and can't be forged or used to probe other members.
import { createHmac } from "node:crypto";
import type { TierKey } from "@/lib/loyalty-rules";
import { appSecret } from "./secret";
import { safeEqual } from "./crypto";

const sig = (payload: string) => createHmac("sha256", appSecret()).update(`share:${payload}`).digest("base64url").slice(0, 16);

/** `/s/{referralCode}?n=…&s=…&t=…&k=…` (n: first name, s: cents saved, t: tier). The link also carries the referral. */
export function sharePath(m: { referralCode: string; firstName: string; savedCents: number; tier: TierKey }) {
  const q = new URLSearchParams({ n: m.firstName.slice(0, 24), s: String(Math.max(0, Math.round(m.savedCents))), t: m.tier });
  return `/s/${m.referralCode}?${q}&k=${sig(`${m.referralCode}?${q}`)}`;
}

export function readShare(referralCode: string, sp: { n?: string; s?: string; t?: string; k?: string }) {
  const q = new URLSearchParams({ n: sp.n ?? "", s: sp.s ?? "", t: sp.t ?? "" });
  if (!safeEqual(sp.k ?? "", sig(`${referralCode}?${q}`))) return null;
  return { referralCode, firstName: sp.n!, savedCents: Number(sp.s), tier: sp.t as TierKey };
}
