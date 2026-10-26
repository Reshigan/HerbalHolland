// The social account kit for @herbalhollandza (Instagram; Facebook and TikTok match): the profile avatars, the Facebook cover, the
// story-size cover, the Instagram highlight covers and the pinned set (three square posts, three stories), rendered
// from HTML with the brand font and the Mark into public/brand/social. Brand-led only: no products, prices or
// consumption on social (docs/SOCIAL-ACCOUNTS.md has the rules and the setup steps).
//   npx tsx scripts/social-kit.tsx
import { mkdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { MarkGlyph } from "../src/components/brand/logo";
import { JOIN_QR, qrSvg } from "./qr";

const OUT = "public/brand/social";
const SUNSET = "#f5913c", INK = "#0c0a09", CREAM = "#fbf7f1", INK_450 = "#8f8780";
const JOIN = "herbalholland.com/join";
mkdirSync(OUT, { recursive: true });

const font = readFileSync("node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2").toString("base64");
const mark = (color: string, heavy = false) => renderToStaticMarkup(<svg viewBox="0 0 100 100" width="100%" height="100%" color={color}><MarkGlyph heavy={heavy} /></svg>);
const WORDS = `<span>HERBAL</span><b>HOLLAND</b>`;
const wordmark = `<div class="wm">${WORDS}</div>`;

type Spec = { name: string; w: number; h: number; ground: string; ink: string; body: string; css?: string };

/** One page: the font, the ground, the shared type styles, then the card's own body and CSS. */
const html = (s: Spec) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:O;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
  *{box-sizing:border-box}
  html,body{margin:0;width:${s.w}px;height:${s.h}px;background:${s.ground};color:${s.ink};font-family:O;-webkit-font-smoothing:antialiased}
  body{position:relative;overflow:hidden}
  .wm{line-height:.92;letter-spacing:.16em}.wm span{display:block;font-weight:300}.wm b{display:block;font-weight:800;letter-spacing:.07em}
  .eyebrow{font-weight:700;letter-spacing:.24em;text-transform:uppercase}
  .h{font-weight:700;letter-spacing:-.025em;line-height:.98}
  .p{font-weight:400;line-height:1.3}
  .small{font-weight:600;letter-spacing:.2em;text-transform:uppercase;opacity:.72}
  .rule{height:6px;border-radius:3px;background:${s.ink}}
  .m{display:block}
  ${s.css ?? ""}
</style></head><body>${s.body}</body></html>`;

// ── Avatars 1024×1024: the Mark alone, filling the circle Facebook and Instagram crop to ─────────────────────────────
const avatar = (name: string, ground: string, ink: string): Spec => ({
  name, w: 1024, h: 1024, ground, ink,
  body: `<div class="m" style="position:absolute;left:172px;top:176px;width:680px;height:680px">${mark(ink, true)}</div>`,
});

// ── Facebook cover 1640×624: everything inside the centre 1280×520, which survives the phone crop (820×312 shown) ────
const cover: Spec = {
  name: "facebook-cover", w: 1640, h: 624, ground: INK, ink: SUNSET,
  body: `
    <div style="position:absolute;left:180px;top:52px;width:1280px;height:520px;display:flex;align-items:center;justify-content:center;gap:80px">
      <div class="m" style="width:320px;height:320px;flex:none">${mark(SUNSET)}</div>
      <div style="flex:none;max-width:820px">
        ${wordmark}
        <div class="p" style="margin-top:34px;font-size:40px;color:${CREAM};max-width:820px">Holland, meet the Hills. Hillcrest and Hilton, opening Tuesday 1 December. Members only, adults 18+.</div>
        <div class="small" style="margin-top:30px;font-size:22px;color:${SUNSET};opacity:1">Join Herbal Holland Rewards, free</div>
        <div class="small" style="margin-top:8px;font-size:22px;color:${INK_450}">${JOIN}</div>
      </div>
    </div>`,
  css: `.wm{font-size:64px}`,
};

// ── Story-size cover 1080×1920 (TikTok profile video poster, Instagram story frame) ───────────────────────────────────
const storyCover: Spec = {
  name: "story-cover", w: 1080, h: 1920, ground: INK, ink: SUNSET,
  body: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 120px">
      <div class="m" style="width:420px;height:420px">${mark(SUNSET)}</div>
      <div style="margin-top:40px">${wordmark}</div>
      <div class="rule" style="width:110px;margin:72px 0 56px"></div>
      <div class="h" style="font-size:84px;color:${CREAM}">Bluff.<br>Pietermaritzburg.<br>Now open.</div>
      <div class="small" style="position:absolute;bottom:120px;font-size:26px;color:${SUNSET}">@herbalhollandza · Adults 18+</div>
    </div>`,
  css: `.wm{font-size:72px;text-align:center}`,
};

// ── Instagram highlight covers 1080×1080: one word in the circle Instagram shows (the middle ~60%) ───────────────────
const HIGHLIGHTS: [string, string, boolean][] = [["rewards", "Rewards", false], ["stores", "Stores", true], ["specials", "Specials", false], ["founding", "Founding", true], ["learn", "Learn", false]];
const highlight = ([slug, label, flip]: [string, string, boolean]): Spec => {
  const ground = flip ? SUNSET : INK, ink = flip ? INK : SUNSET;
  return {
    name: `highlight-${slug}`, w: 1080, h: 1080, ground, ink,
    body: `
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
        <div class="m" style="width:220px;height:220px">${mark(ink, true)}</div>
        <div class="h" style="margin-top:36px;font-size:${label.length > 8 ? 92 : 108}px">${label}</div>
      </div>`,
  };
};

// ── The pinned set: three square posts and the same three as stories ─────────────────────────────────────────────────
/** A layout that works at both sizes: the content column, a small lock-up at the top, the footer line at the bottom. */
const frame = (tall: boolean, ink: string, inner: string, footer = `Adults 18+ · @herbalhollandza`) => `
  <div style="position:absolute;inset:0;padding:${tall ? "160px 96px 150px" : "88px 88px 84px"};display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:22px">
      <div class="m" style="width:${tall ? 110 : 96}px;height:${tall ? 110 : 96}px">${mark(ink)}</div>
      <div class="wm" style="font-size:${tall ? 26 : 22}px">${WORDS}</div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center">${inner}</div>
    <div class="small" style="font-size:${tall ? 26 : 22}px">${footer}</div>
  </div>`;

const CARDS = [
  {
    slug: "1-welcome", ground: INK, ink: SUNSET,
    inner: (tall: boolean) => `
      <div class="eyebrow" style="font-size:${tall ? 30 : 26}px;color:${SUNSET}">Since the 1970s</div>
      <div class="h" style="margin-top:${tall ? 40 : 28}px;font-size:${tall ? 132 : 112}px;color:${CREAM}">Holland,<br>meet <span style="color:${SUNSET}">the Hills.</span></div>
      <div class="p" style="margin-top:${tall ? 56 : 40}px;font-size:${tall ? 44 : 38}px;color:${INK_450};max-width:${tall ? 860 : 820}px">A seed left the hills behind Durban and found a home in Holland. Fifty years on, it's coming home: Hillcrest and Hilton, from 1 December.</div>`,
  },
  {
    slug: "2-founding", ground: SUNSET, ink: INK,
    inner: (tall: boolean) => `
      <div class="eyebrow" style="font-size:${tall ? 30 : 26}px">Founding Members</div>
      <div class="h" style="margin-top:${tall ? 32 : 20}px;font-size:${tall ? 300 : 250}px;letter-spacing:-.04em;line-height:.9">2,026</div>
      <div class="h" style="margin-top:${tall ? 28 : 18}px;font-size:${tall ? 64 : 56}px">numbered cards. Then the list closes.</div>
      <div class="p" style="margin-top:${tall ? 48 : 34}px;font-size:${tall ? 40 : 34}px;max-width:${tall ? 880 : 860}px;line-height:1.35">Be one of the first 2,026 to join Herbal Holland Rewards and start at Sprout tier for 14 months. Every friend you refer moves you up 250 places.</div>
      <div class="small" style="margin-top:${tall ? 48 : 34}px;font-size:${tall ? 26 : 22}px;opacity:1">${JOIN}</div>`,
  },
  {
    slug: "3-join", ground: INK, ink: SUNSET,
    inner: (tall: boolean) => `
      <div class="eyebrow" style="font-size:${tall ? 30 : 26}px;color:${SUNSET}">Free to join</div>
      <div class="h" style="margin-top:${tall ? 32 : 22}px;font-size:${tall ? 104 : 92}px;color:${CREAM}">How to join<br>in 20 seconds</div>
      <ol style="list-style:none;margin:${tall ? 64 : 44}px 0 0;padding:0;display:flex;flex-direction:column;gap:${tall ? 34 : 24}px">
        ${["Scan the code, or ask at any till", "Your name and mobile number", "Your card is ready: show it at any store"]
          .map((t, i) => `<li style="display:flex;align-items:center;gap:30px"><span style="flex:none;width:${tall ? 92 : 80}px;height:${tall ? 92 : 80}px;border-radius:50%;background:${SUNSET};color:${INK};font-weight:800;font-size:${tall ? 46 : 40}px;display:flex;align-items:center;justify-content:center">${i + 1}</span><span class="p" style="font-size:${tall ? 44 : 38}px;color:${CREAM}">${t}</span></li>`)
          .join("")}
      </ol>
      <div style="margin-top:${tall ? 60 : 22}px;display:flex;align-items:center;gap:${tall ? 36 : 28}px">
        <div style="flex:none;width:${tall ? 240 : 150}px;height:${tall ? 240 : 150}px">${qrSvg(JOIN_QR, INK, CREAM)}</div>
        <div><div class="p" style="font-size:${tall ? 34 : 28}px;color:${CREAM}">Scan to join</div><div class="small" style="margin-top:8px;font-size:${tall ? 26 : 22}px;color:${SUNSET};opacity:1">${JOIN}</div></div>
      </div>`,
  },
  ...[
    ["4-bluff", "Bluff", "208 Tara Road, Bluff, Durban"],
    ["5-pietermaritzburg", "Pietermaritzburg", "575 Chota Motala Road, Raisethorpe"],
  ].map(([slug, town, street]) => ({
    slug, ground: INK, ink: SUNSET,
    inner: (tall: boolean) => `
      <div class="eyebrow" style="font-size:${tall ? 30 : 26}px;color:${SUNSET}">Now open</div>
      <div class="h" style="margin-top:${tall ? 36 : 24}px;font-size:${(tall ? 1700 : 1500) / Math.max(town.length, 8)}px;color:${CREAM}">${town}.</div>
      <div class="p" style="margin-top:${tall ? 48 : 34}px;font-size:${tall ? 44 : 38}px;color:${INK_450};max-width:${tall ? 880 : 860}px">${street}. Members only, and joining is free: at the till, or on your phone in a minute.</div>
      <div class="small" style="margin-top:${tall ? 56 : 38}px;font-size:${tall ? 26 : 22}px;color:${SUNSET};opacity:1">${JOIN}</div>`,
  })),
  {
    slug: "6-december", ground: SUNSET, ink: INK,
    inner: (tall: boolean) => `
      <div class="eyebrow" style="font-size:${tall ? 30 : 26}px">Tuesday 1 December</div>
      <div class="h" style="margin-top:${tall ? 32 : 20}px;font-size:${tall ? 150 : 124}px">Hillcrest.<br>Hilton.</div>
      <div class="p" style="margin-top:${tall ? 48 : 34}px;font-size:${tall ? 42 : 36}px;max-width:${tall ? 880 : 860}px;line-height:1.35">Two new stores in the hills open on the same day. Join free now and your card works there from the first morning.</div>
      <div class="small" style="margin-top:${tall ? 48 : 34}px;font-size:${tall ? 26 : 22}px;opacity:1">${JOIN}</div>`,
  },
  {
    slug: "7-friend", ground: INK, ink: SUNSET,
    inner: (tall: boolean) => `
      <div class="eyebrow" style="font-size:${tall ? 30 : 26}px;color:${SUNSET}">Bring a friend</div>
      <div class="h" style="margin-top:${tall ? 32 : 22}px;font-size:${tall ? 112 : 96}px;color:${CREAM}">Better<br>together.</div>
      <div class="p" style="margin-top:${tall ? 48 : 34}px;font-size:${tall ? 42 : 36}px;color:${INK_450};max-width:${tall ? 880 : 860}px">Your link is in the Rewards app. When a friend (18+) joins with it and makes their first purchase, you each get points.</div>
      <div class="small" style="margin-top:${tall ? 56 : 38}px;font-size:${tall ? 26 : 22}px;color:${SUNSET};opacity:1">${JOIN}</div>`,
  },
] satisfies { slug: string; ground: string; ink: string; inner: (tall: boolean) => string }[];
const card = (c: (typeof CARDS)[number], tall: boolean): Spec => ({
  name: `${tall ? "story" : "post"}-${c.slug}`, w: 1080, h: tall ? 1920 : 1080, ground: c.ground, ink: c.ink,
  body: frame(tall, c.ink, c.inner(tall)),
  css: `.wm{letter-spacing:.14em}`,
});

const specs: Spec[] = [
  avatar("avatar-ink", INK, SUNSET),
  avatar("avatar-brand", SUNSET, INK),
  cover,
  storyCover,
  ...HIGHLIGHTS.map(highlight),
  ...CARDS.flatMap((c) => [card(c, false), card(c, true)]),
];

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const page = await browser.newPage();
for (const s of specs) {
  await page.setViewportSize({ width: s.w, height: s.h });
  await page.setContent(html(s));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log(`${s.name}.png  ${s.w}×${s.h}`);
}
await browser.close();
