// Campaign Studio cards, drawn with next/og in the brand's own type (Outfit, Inter) and colours: the orange window frame
// on warm black, the windmill, the KwaZulu-Natal hills, "Adults 18+" on every one. No stock photos and no AI pictures.
// Square for feeds, portrait for Instagram, story for Stories and WhatsApp Status, link for link previews. Postiz gets
// them as JPEG (Instagram takes nothing else).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { markDataUri } from "@/components/shop/mark-svg";
import { HILLS } from "@/lib/hills";
import type { Card } from "@/lib/studio";

export const CARD_SIZES = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920], link: [1200, 630] } as const;
export type CardSize = keyof typeof CARD_SIZES;
export const isCardSize = (s: string | null): s is CardSize => !!s && Object.hasOwn(CARD_SIZES, s);

const INK = "#0c0a09", BRAND = "#f5913c", CREAM = "#fbf7f3", SOFT = "#bdb3a9";

const font = (f: string) => readFile(join(process.cwd(), "src/assets/fonts", f));
const FONTS = Promise.all([font("outfit-700.ttf"), font("outfit-600.ttf"), font("inter-400.ttf"), font("inter-600.ttf")]).then(([o7, o6, i4, i6]) => [
  { name: "Outfit", data: o7, weight: 700 as const, style: "normal" as const },
  { name: "Outfit", data: o6, weight: 600 as const, style: "normal" as const },
  { name: "Inter", data: i4, weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: i6, weight: 600 as const, style: "normal" as const },
]);

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
// The hills in four tones of orange, far to near, as the site draws them.
const HILLS_URI = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 560 1600 440" preserveAspectRatio="xMidYMax slice">${Object.values(HILLS)
    .map((d, i) => `<path d="${d}" fill="${BRAND}" fill-opacity="${[0.16, 0.3, 0.55, 1][i]}"/>`)
    .join("")}</svg>`,
);
const TICK_URI = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${BRAND}"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

const picture = async (key: string) => `data:image/jpeg;base64,${(await readFile(join(process.cwd(), "public/social", `${key}.jpg`))).toString("base64")}`;

/** Type sizes per format: the link card is short, the story tall. */
function scale(size: CardSize) {
  const [w, h] = CARD_SIZES[size];
  const k = size === "link" ? 0.7 : size === "story" ? 1.18 : size === "portrait" ? 1.06 : 1;
  const pad = size === "link" ? 22 : 34, frame = size === "link" ? 12 : 18, inner = size === "link" ? 44 : 72;
  return { w, h, k, pad, frame, inner, innerW: w - 2 * (pad + frame), innerH: h - 2 * (pad + frame) };
}

export async function renderCard(card: Card, size: CardSize = "square") {
  const s = scale(size);
  const px = (n: number) => Math.round(n * s.k);
  const eyebrow = card.eyebrow && <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: px(30), letterSpacing: px(5), color: BRAND, marginBottom: px(22) }}>{card.eyebrow.toUpperCase()}</div>;
  const headline = (fs = 100, color = CREAM) => <div style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: px(fs), lineHeight: 1.04, letterSpacing: -px(2), color }}>{card.headline}</div>;
  const sub = card.sub && <div style={{ fontFamily: "Inter", fontWeight: 400, fontSize: px(42), lineHeight: 1.3, color: SOFT, marginTop: px(26) }}>{card.sub}</div>;
  const mark = (n: number) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={markDataUri({ bg: null, size: n, inset: 0 })} width={n} height={n} alt="" />
  );
  const brandRow = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: px(18) }}>
        {mark(px(64))}
        <div style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: px(30), letterSpacing: px(6), color: BRAND }}>HERBAL HOLLAND</div>
      </div>
      <div style={{ display: "flex", border: `${px(3)}px solid ${BRAND}`, borderRadius: 999, padding: `${px(8)}px ${px(20)}px`, fontFamily: "Inter", fontWeight: 600, fontSize: px(24), color: CREAM }}>ADULTS 18+</div>
    </div>
  );

  let body: React.ReactNode;
  let top = false; // the brand row above the words, leaving the bottom to the hills
  switch (card.template) {
    case "reveal":
      top = true;
      body = (
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
            {eyebrow}
            {headline(104)}
            {sub}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HILLS_URI} width={s.innerW} height={Math.round(Math.min((s.innerW * 440) / 1600, s.innerH * 0.32))} alt="" style={{ marginLeft: -s.inner, marginRight: -s.inner, marginBottom: -s.inner, flexShrink: 0 }} />
        </div>
      );
      break;
    case "countdown":
      body = (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          {eyebrow}
          {headline(220, BRAND)}
          {card.sub && <div style={{ fontFamily: "Outfit", fontWeight: 600, fontSize: px(56), lineHeight: 1.15, color: CREAM, marginTop: px(24) }}>{card.sub}</div>}
        </div>
      );
      break;
    case "promise":
      body = (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          {eyebrow}
          {headline(76)}
          <div style={{ display: "flex", flexDirection: "column", gap: px(22), marginTop: px(40) }}>
            {(card.lines ?? []).map((l) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: px(22) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={TICK_URI} width={px(40)} height={px(40)} alt="" />
                <div style={{ fontFamily: "Inter", fontWeight: 400, fontSize: px(36), color: CREAM, flex: 1 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case "event":
      body = (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          {eyebrow}
          {headline(108, BRAND)}
          {sub}
          {card.lines?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: px(10), marginTop: px(30) }}>
              {card.lines.map((l) => (
                <div key={l} style={{ fontFamily: "Inter", fontWeight: 600, fontSize: px(32), color: CREAM }}>{l}</div>
              ))}
            </div>
          ) : null}
        </div>
      );
      break;
    case "merch": {
      const pic = card.image ? await picture(card.image) : null;
      const side = { link: 380, square: 380, portrait: 600, story: 820 }[size];
      const img = pic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pic} width={side} height={side} alt="" style={{ borderRadius: px(28), flexShrink: 0 }} />
      );
      body =
        size === "link" ? (
          <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 40 }}>
            {img}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {eyebrow}
              {headline(80)}
              {sub}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
            {img}
            <div style={{ display: "flex", flexDirection: "column", alignSelf: "stretch", marginTop: px(40) }}>
              {eyebrow}
              {headline(size === "square" ? 64 : 84)}
              {sub}
            </div>
          </div>
        );
      break;
    }
    default:
      body = (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          {eyebrow}
          {headline(110)}
          {sub}
        </div>
      );
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: INK, padding: s.pad }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", border: `${s.frame}px solid ${BRAND}`, borderRadius: size === "link" ? 30 : 44, padding: s.inner, overflow: "hidden", gap: px(28) }}>
          {top && brandRow}
          {body}
          {!top && brandRow}
        </div>
      </div>
    ),
    { width: s.w, height: s.h, fonts: await FONTS },
  );
}

/** The card as a JPEG (what Instagram takes, and what a phone saves). */
export async function cardJpeg(card: Card, size: CardSize = "portrait") {
  const png = Buffer.from(await (await renderCard(card, size)).arrayBuffer());
  return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}
