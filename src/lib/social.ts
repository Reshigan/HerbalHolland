// Social posts (HQ → Campaigns → Social), published straight to each network (src/server/social.ts). Instagram, Facebook and
// TikTok remove posts that sell cannabis or CBD and can close the account, so social is for the brand (merch,
// stores, events, Learn), never products for sale. Copy is screened with screenCopy plus the platform rules below,
// and the only images on offer are brand artwork (public/social, rendered by scripts/merch-export.tsx --social).
import { screenCopy } from "./compliance";
import { MERCH } from "./merch";

export type SocialChannel = { id: string; name: string; identifier: string; picture?: string | null };
export type SocialMode = "now" | "schedule";

/**
 * The networks we post to: caption limit, whether a picture is required, and whether a video is required (YouTube
 * Shorts) or taken when there is one (TikTok posts the card as a photo without one; X and the rest take the picture).
 */
export const SOCIAL_NETWORKS: Record<string, { label: string; limit: number; image?: true; video?: "required" | "optional" }> = {
  instagram: { label: "Instagram", limit: 2200, image: true },
  facebook: { label: "Facebook", limit: 63_206 },
  threads: { label: "Threads", limit: 500 },
  bluesky: { label: "Bluesky", limit: 300 },
  telegram: { label: "Telegram", limit: 1024 }, // a photo's caption
  tiktok: { label: "TikTok", limit: 2200, image: true, video: "optional" },
  youtube: { label: "YouTube Shorts", limit: 5000, video: "required" },
  linkedin: { label: "LinkedIn", limit: 3000 },
  x: { label: "X", limit: 280, video: "optional" },
  pinterest: { label: "Pinterest", limit: 800, image: true },
};
/** The networks a post goes to when it has no video: everything but the video-only ones. */
export const withoutVideo = (identifiers: string[]) => identifiers.filter((i) => SOCIAL_NETWORKS[i]?.video !== "required");

/** The caption for a network: the short version where the full one is too long for it. */
export const captionFor = (identifier: string, content: string, short?: string | null) => (short && content.length > (SOCIAL_NETWORKS[identifier]?.limit ?? 2200) ? short : content);

/** Caption limit for the chosen networks (social copy stays short: 2,200 at most). */
export const limitFor = (identifiers: string[]) => Math.min(2200, ...identifiers.map((i) => SOCIAL_NETWORKS[i]?.limit ?? 2200));
export const needsImage = (identifiers: string[]) => identifiers.some((i) => SOCIAL_NETWORKS[i]?.image);

export const SOCIAL_IMAGES = [{ key: "brand", label: "Window poster" }, ...MERCH.filter((m) => !m.pending).map((m) => ({ key: m.slug, label: m.name }))];

// The marketing plan's own rules (docs/MARKETING-PLAN.md §1): no cannabis or CBD hashtags, no 4/20, no leaf or smoke.
const HASHTAG = /#(cbd|thc|cannabis|marijuana|weed|dagga|hemp|420|ganja|kush|stoner|highlife|high|edibles?|pre-?rolls?|bud|dispensary)\b/i;
const STONER = /\b4\/20\b|#420\b|\b420 ?(friendly|day|vibes)\b/i;
const EMOJI = /[\u{1F33F}\u{1F343}\u{1F4A8}\u{1F6AC}]/u; // 🌿 🍃 💨 🚬
const PRODUCT = /\b(cbd|cannabis|marijuana|weed|dagga|strains?|pre-?rolls?|joints?|edibles?|gummies|tinctures?|vapes?|hash)\b/i;
const SELLING = /\b(buy|order|shop|in stock|deliver(y|ed|s)?|prices?|specials?|deals?|discount|sale|promo|R ?\d+|\d+ ?% off)\b/i;

/** screenCopy plus the platform rules: no THC (a licensed medicine, Medicines Act s20) and no selling cannabis or CBD. */
export function screenSocial(text: string) {
  const found = screenCopy(text);
  const thc = text.match(/\bthc\b/i);
  if (thc) found.push({ term: thc[0], reason: "THC products are licensed medicines, never advertised to the public (Medicines Act General Regulations reg 42)" });
  const product = text.match(PRODUCT), selling = text.match(SELLING);
  if (product && selling) found.push({ term: `${product[0]} … ${selling[0]}`, reason: "Sells cannabis or CBD: Meta and TikTok remove these posts and can close the account. Talk about the brand, not products for sale" });
  const tags = text.match(/(^|\s)#\w+/g) ?? [];
  if (tags.length > 5) found.push({ term: `${tags.length} hashtags`, reason: "Instagram takes 5 hashtags at most" });
  for (const [re, reason] of [
    [HASHTAG, "No cannabis or CBD hashtags: they flag the account and bring the wrong audience"],
    [STONER, "No 4/20: no stoner clichés"],
    [EMOJI, "No leaf or smoke emoji: no consumption imagery"],
  ] as const) {
    const m = text.match(re);
    if (m) found.push({ term: m[0], reason });
  }
  return found;
}
