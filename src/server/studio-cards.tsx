// Campaign Studio cards, drawn in the brand's own type (Outfit, Inter) and colours: the orange window frame on warm
// black, the windmill, the KwaZulu-Natal hills, "Adults 18+" on every one. No stock photos and no AI pictures.
// Square for feeds, portrait for Instagram, story for Stories and WhatsApp Status, link for link previews. The networks
// get them as JPEG (Instagram takes nothing else).
// Each card is a small HTML page laid out with flexbox, rendered by Cloudflare Browser Rendering (`withPage`, the
// `BROWSER` binding) and screenshotted at its exact pixel size. The fonts (public/fonts/studio) and the merch photos
// (public/social) are fetched from the app itself over HTTP, since a Worker has no filesystem.
import { markDataUri } from "@/components/shop/mark-svg";
import { HILLS } from "@/lib/hills";
import type { Card } from "@/lib/studio";
import { APP_URL } from "@/server/invoices";
import { withPage } from "@/server/pdf";

export const CARD_SIZES = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920], link: [1200, 630] } as const;
export type CardSize = keyof typeof CARD_SIZES;
export const isCardSize = (s: string | null): s is CardSize => !!s && Object.hasOwn(CARD_SIZES, s);

const INK = "#0c0a09", BRAND = "#f5913c", CREAM = "#fbf7f3", SOFT = "#bdb3a9";

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
// The hills in four tones of orange, far to near, as the site draws them.
const HILLS_URI = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 560 1600 440" preserveAspectRatio="xMidYMax slice">${Object.values(HILLS)
    .map((d, i) => `<path d="${d}" fill="${BRAND}" fill-opacity="${[0.16, 0.3, 0.55, 1][i]}"/>`)
    .join("")}</svg>`,
);
const TICK_URI = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${BRAND}"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

const picture = (key: string) => `${APP_URL()}/social/${encodeURIComponent(key)}.jpg`;

const FONT_FACES = () =>
  (
    [
      ["Outfit", 700, "outfit-700"],
      ["Outfit", 600, "outfit-600"],
      ["Inter", 400, "inter-400"],
      ["Inter", 600, "inter-600"],
    ] as const
  )
    .map(([family, weight, file]) => `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url("${APP_URL()}/fonts/studio/${file}.ttf") format("truetype")}`)
    .join("");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const css = (style: Record<string, string | number | undefined>) =>
  Object.entries(style)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}:${typeof v === "number" && k !== "line-height" && k !== "flex" && k !== "font-weight" && k !== "flex-shrink" ? `${v}px` : v}`)
    .join(";");
const div = (style: Record<string, string | number | undefined>, children: string) => `<div style="${css(style)}">${children}</div>`;
const img = (src: string, w: number, h: number, style: Record<string, string | number | undefined> = {}) => `<img src="${src}" width="${w}" height="${h}" alt="" style="${css(style)}">`;

/** Type sizes per format: the link card is short, the story tall. */
function scale(size: CardSize) {
  const [w, h] = CARD_SIZES[size];
  const k = size === "link" ? 0.7 : size === "story" ? 1.18 : size === "portrait" ? 1.06 : 1;
  const pad = size === "link" ? 22 : 34, frame = size === "link" ? 12 : 18, inner = size === "link" ? 44 : 72;
  return { w, h, k, pad, frame, inner, innerW: w - 2 * (pad + frame), innerH: h - 2 * (pad + frame) };
}

/** The card as a complete HTML document at its pixel size (what the browser screenshots). */
export function cardHtml(card: Card, size: CardSize = "square") {
  const s = scale(size);
  const px = (n: number) => Math.round(n * s.k);
  const col = { display: "flex", "flex-direction": "column" };
  const eyebrow = card.eyebrow ? div({ "font-family": "Inter", "font-weight": 600, "font-size": px(30), "letter-spacing": px(5), color: BRAND, "margin-bottom": px(22) }, esc(card.eyebrow.toUpperCase())) : "";
  const headline = (fs = 100, color = CREAM) => div({ "font-family": "Outfit", "font-weight": 700, "font-size": px(fs), "line-height": 1.04, "letter-spacing": -px(2), color }, esc(card.headline));
  const sub = card.sub ? div({ "font-family": "Inter", "font-weight": 400, "font-size": px(42), "line-height": 1.3, color: SOFT, "margin-top": px(26) }, esc(card.sub)) : "";
  const mark = (n: number) => img(markDataUri({ bg: null, size: n, inset: 0 }), n, n);
  const brandRow = div(
    { display: "flex", "align-items": "center", "justify-content": "space-between" },
    div({ display: "flex", "align-items": "center", gap: px(18) }, mark(px(64)) + div({ "font-family": "Outfit", "font-weight": 700, "font-size": px(30), "letter-spacing": px(6), color: BRAND }, "HERBAL HOLLAND")) +
      div({ display: "flex", border: `${px(3)}px solid ${BRAND}`, "border-radius": 999, padding: `${px(8)}px ${px(20)}px`, "font-family": "Inter", "font-weight": 600, "font-size": px(24), color: CREAM }, "ADULTS 18+"),
  );

  let body: string;
  let top = false; // the brand row above the words, leaving the bottom to the hills
  switch (card.template) {
    case "reveal":
      top = true;
      body = div(
        { ...col, flex: 1 },
        div({ ...col, flex: 1, "justify-content": "center" }, eyebrow + headline(104) + sub) +
          img(HILLS_URI, s.innerW, Math.round(Math.min((s.innerW * 440) / 1600, s.innerH * 0.32)), { "margin-left": -s.inner, "margin-right": -s.inner, "margin-bottom": -s.inner, "flex-shrink": 0 }),
      );
      break;
    case "countdown":
      body = div(
        { ...col, flex: 1, "justify-content": "center" },
        eyebrow + headline(220, BRAND) + (card.sub ? div({ "font-family": "Outfit", "font-weight": 600, "font-size": px(56), "line-height": 1.15, color: CREAM, "margin-top": px(24) }, esc(card.sub)) : ""),
      );
      break;
    case "promise":
      body = div(
        { ...col, flex: 1, "justify-content": "center" },
        eyebrow +
          headline(76) +
          div(
            { ...col, gap: px(22), "margin-top": px(40) },
            (card.lines ?? []).map((l) => div({ display: "flex", "align-items": "center", gap: px(22) }, img(TICK_URI, px(40), px(40)) + div({ "font-family": "Inter", "font-weight": 400, "font-size": px(36), color: CREAM, flex: 1 }, esc(l)))).join(""),
          ),
      );
      break;
    case "event":
      body = div(
        { ...col, flex: 1, "justify-content": "center" },
        eyebrow +
          headline(108, BRAND) +
          sub +
          (card.lines?.length ? div({ ...col, gap: px(10), "margin-top": px(30) }, card.lines.map((l) => div({ "font-family": "Inter", "font-weight": 600, "font-size": px(32), color: CREAM }, esc(l))).join("")) : ""),
      );
      break;
    case "merch": {
      const side = { link: 380, square: 380, portrait: 600, story: 820 }[size];
      const pic = card.image ? img(picture(card.image), side, side, { "border-radius": px(28), "flex-shrink": 0, "object-fit": "cover" }) : "";
      body =
        size === "link"
          ? div({ display: "flex", flex: 1, "align-items": "center", gap: 40 }, pic + div({ ...col, flex: 1 }, eyebrow + headline(80) + sub))
          : div({ ...col, flex: 1, "align-items": "center", "justify-content": "center" }, pic + div({ ...col, "align-self": "stretch", "margin-top": px(40) }, eyebrow + headline(size === "square" ? 64 : 84) + sub));
      break;
    }
    default:
      body = div({ ...col, flex: 1, "justify-content": "center" }, eyebrow + headline(110) + sub);
  }

  const frame = div(
    { width: s.w, height: s.h, display: "flex", background: INK, padding: s.pad },
    div({ flex: 1, display: "flex", "flex-direction": "column", border: `${s.frame}px solid ${BRAND}`, "border-radius": size === "link" ? 30 : 44, padding: s.inner, overflow: "hidden", gap: px(28) }, (top ? brandRow : "") + body + (top ? "" : brandRow)),
  );
  // Flexbox as satori (Yoga) laid it out: border-box sizes, items that don't shrink, images as blocks, no default margins.
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_FACES()}
*{box-sizing:border-box;margin:0;padding:0;flex-shrink:0;min-width:0;min-height:0}html,body{width:${s.w}px;height:${s.h}px;overflow:hidden;background:${INK}}
div{display:block;overflow-wrap:break-word;-webkit-font-smoothing:antialiased}img{display:block}</style></head><body>${frame}</body></html>`;
}

/** Screenshots the card at its pixel size. Only inside a Cloudflare request (the `BROWSER` binding). */
async function shoot(card: Card, size: CardSize, type: "png" | "jpeg") {
  const [w, h] = CARD_SIZES[size];
  return withPage(async (page) => {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(cardHtml(card, size), { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.screenshot({ type, ...(type === "jpeg" ? { quality: 90 } : {}), clip: { x: 0, y: 0, width: w, height: h } }));
  });
}

/** The card as a PNG response (what HQ previews). */
export async function renderCard(card: Card, size: CardSize = "square") {
  return new Response(new Uint8Array(await shoot(card, size, "png")), { headers: { "Content-Type": "image/png" } });
}

/** The card as a JPEG (what Instagram takes, and what a phone saves). */
export async function cardJpeg(card: Card, size: CardSize = "portrait") {
  return shoot(card, size, "jpeg");
}
