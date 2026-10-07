// Social posts (HQ → Campaigns → Social), published through Postiz (src/server/social.ts). Instagram, Facebook and
// TikTok remove posts that sell cannabis or CBD and can close the account, so social is for the brand (merch,
// stores, events, Learn), never products for sale. Copy is screened with screenCopy plus the platform rules below,
// and the only images on offer are brand artwork (public/social, rendered by scripts/merch-export.tsx --social).
import { screenCopy } from "./compliance";
import { MERCH } from "./merch";

export type SocialChannel = { id: string; name: string; identifier: string; picture?: string | null };
export type SocialMode = "now" | "schedule" | "draft";

/** The Postiz providers we post to: caption limit, whether a picture is required, provider settings. TikTok is left out (video only, and it bans cannabis content). */
export const SOCIAL_NETWORKS: Record<string, { label: string; limit: number; image?: true; settings?: Record<string, string> }> = {
  instagram: { label: "Instagram", limit: 2200, image: true, settings: { post_type: "post" } },
  "instagram-standalone": { label: "Instagram", limit: 2200, image: true, settings: { post_type: "post" } },
  facebook: { label: "Facebook", limit: 63_206 },
  linkedin: { label: "LinkedIn", limit: 3000 },
  "linkedin-page": { label: "LinkedIn", limit: 3000 },
  x: { label: "X", limit: 280, settings: { who_can_reply_post: "everyone" } },
  threads: { label: "Threads", limit: 500 },
  bluesky: { label: "Bluesky", limit: 300 },
  telegram: { label: "Telegram", limit: 1024 }, // a photo's caption
};

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

/** The Postiz "create post" body (POST /posts): one entry per channel, the same picture, and the short version where the caption is too long for the network. */
export function postizPost(p: { mode: SocialMode; at: Date; content: string; short?: string | null; image: { id: string; path: string } | null; channels: SocialChannel[] }) {
  return {
    type: p.mode,
    date: p.at.toISOString(),
    shortLink: false,
    tags: [],
    posts: p.channels.map((c) => ({
      integration: { id: c.id },
      value: [{ content: p.short && p.content.length > (SOCIAL_NETWORKS[c.identifier]?.limit ?? 2200) ? p.short : p.content, image: p.image ? [p.image] : [] }],
      settings: { __type: c.identifier, ...SOCIAL_NETWORKS[c.identifier]?.settings },
    })),
  };
}
