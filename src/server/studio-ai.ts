// Optional drafting help in the brand's voice, through Cloudflare Workers AI: a free daily allowance, and Cloudflare
// doesn't train on what it's sent. Off unless both are set:
//   WORKERS_AI_ACCOUNT_ID=…   the Cloudflare account
//   WORKERS_AI_TOKEN=…        an API token with Workers AI read and edit
//   WORKERS_AI_MODEL=…        optional; @cf/meta/llama-3.3-70b-instruct-fp8-fast by default
// It sees only the draft and the brand's rules, never a member's details. What it suggests is screened like any draft,
// and a person decides whether to use it.
import { LIMITS, STUDIO_CHANNELS, type StudioChannel } from "@/lib/studio";

export const aiReady = () => !!(process.env.WORKERS_AI_ACCOUNT_ID && process.env.WORKERS_AI_TOKEN);

const VOICE = `You write social posts and member messages for Herbal Holland, a South African retail brand with stores in KwaZulu-Natal and an online shop: Dutch heritage, African soil. The idea: "Holland, meet the Hills".
Voice: warm, plain, confident, local. Short sentences. Dutch warmth used lightly (welkom, gezellig); isiZulu greetings where they fit (Sawubona, Sivulile, Siyabonga).
Rules you never break: adults 18+ only; people who join are members, never customers; no medical or health claims; no conditions or symptoms; no "high", intoxication or consumption; no stoner clichés, no 4/20, no leaf or smoke emoji, no cannabis or CBD hashtags; nothing that appeals to children; never sell cannabis, CBD or medicines on social media, WhatsApp or Google: talk about the brand, the stores, events, Learn and merch; no invented facts, prices or numbers; plain punctuation, never an em-dash.`;

const LENGTH: Record<StudioChannel, string> = {
  SOCIAL: `an Instagram and Facebook caption (at most ${LIMITS.SOCIAL} characters; usually two to four short sentences)`,
  WHATSAPP: `a WhatsApp Channel post (at most ${LIMITS.WHATSAPP} characters): store, brand and event news only, no products, no offers`,
  GOOGLE: `a Google Business Profile post (at most ${LIMITS.GOOGLE} characters): store news only, no products, no offers`,
  EMAIL: "a member email: short plain paragraphs",
  SMS: `a text message (at most ${LIMITS.SMS} characters; keep {{firstName}} if it's there)`,
  PUSH: `a push notification (at most ${LIMITS.PUSH} characters)`,
};

/** One suggested rewrite of a draft, following the editor's note. */
export async function suggestRewrite(d: { channel: StudioChannel; text: string }, note: string) {
  const id = process.env.WORKERS_AI_ACCOUNT_ID, token = process.env.WORKERS_AI_TOKEN;
  if (!id || !token) throw new Error("AI drafting isn't set up (WORKERS_AI_ACCOUNT_ID and WORKERS_AI_TOKEN)");
  const model = process.env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(id)}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      max_tokens: 700,
      messages: [
        { role: "system", content: VOICE },
        { role: "user", content: `Rewrite this ${STUDIO_CHANNELS[d.channel].label} draft as ${LENGTH[d.channel]}. ${note || "Make it warmer and tighter."}\nReply with the new text only, no quotes and no notes.\n\n${d.text}` },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch((e) => {
    throw new Error(`Couldn't reach Workers AI (${e instanceof Error ? e.message : e})`);
  });
  const body = (await r.json().catch(() => null)) as { success?: boolean; result?: { response?: string }; errors?: { message: string }[] } | null;
  if (!r.ok || !body?.success || !body.result?.response) throw new Error(`Workers AI said ${r.status}: ${body?.errors?.[0]?.message ?? "no suggestion"}`);
  return body.result.response.trim().replace(/^["“]|["”]$/g, "").replaceAll("—", ",");
}
