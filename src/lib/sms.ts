// SMS copy rules and the transactional texts the platform sends. Pure and unit-tested (tests/sms.test.ts).
//
// Conventions
//   - Every text starts with the sender name: "Herbal Holland: …" (phones show the network's number or our sender
//     ID; the prefix says who's writing either way), then the order code, then the news, then a short link.
//   - One segment where possible: ≤ 160 characters in the GSM 03.38 alphabet. A curly quote or an em dash silently
//     switches the whole message to UCS-2 (70 characters a segment), so gsmSafe() tidies copy before it's sent.
//   - Links are APP_URL paths without the scheme (herbalholland.co.za/orders/X7K2P9): short, and phones make them tappable.
//   - "Reply STOP to opt out" belongs on marketing only (marketing.ts adds it); order updates and sign-in codes never carry it.

export const SMS_BRAND = "Herbal Holland";
export const SMS_SINGLE_SEGMENT = 160;

// GSM 03.38 basic character set plus its extension table (the extension characters cost two septets).
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";
const BASIC = new Set(GSM_BASIC);
const EXT = new Set(GSM_EXT);

export const isGsm7 = (s: string) => [...s].every((c) => BASIC.has(c) || EXT.has(c));

/** Septets a message costs in GSM-7 (extension characters count double); UCS-2 messages count code units. */
export function smsLength(s: string) {
  return isGsm7(s) ? [...s].reduce((n, c) => n + (EXT.has(c) ? 2 : 1), 0) : s.length;
}

/** How many segments the network will bill: 160 GSM-7 septets (153 each when concatenated) or 70 UCS-2 (67 each). */
export function smsSegments(s: string) {
  const gsm = isGsm7(s);
  const len = smsLength(s);
  const [single, each] = gsm ? [160, 153] : [70, 67];
  return len <= single ? 1 : Math.ceil(len / each);
}

/** Replaces the typographic characters that would force UCS-2 with their GSM equivalents; leaves the rest alone. */
export const gsmSafe = (s: string) =>
  s
    .replace(/[—–‒‐‑]/g, "-")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/…/g, "...")
    .replace(/[•·‣●]/g, "-")
    .replace(/[    ]/g, " ")
    .replace(/×/g, "x")
    .replace(/→/g, "->")
    .replace(/✓|✔/g, "OK")
    .replace(/°/g, " deg")
    .replace(/[​-‍﻿]/g, "");

/** A short link: the app's URL without the scheme (kept for http, which phones won't link without it). */
export const shortLink = (appUrl: string, path: string) => `${appUrl.replace(/^https:\/\//, "").replace(/\/$/, "")}${path}`;

/** The sender name convention on every transactional text: "Herbal Holland: …". */
export const sms = (body: string) => gsmSafe(`${SMS_BRAND}: ${body}`);

export type OrderSmsEvent = "placed" | "ready" | "dispatched" | "delivered" | "collected" | "cancelled";

export type OrderSmsInput = {
  code: string;
  fulfilment: "COLLECT" | "SAME_DAY" | "COURIER";
  storeName: string;
  /** The order's tracking page, as a short link. */
  link: string;
  collectionCode?: string | null;
  courier?: string | null;
  trackingNo?: string | null;
  ageRestricted?: boolean;
  paid?: boolean;
};

/**
 * The order texts, code first. Substrings other systems look for stay put: "order CODE received", "CODE is ready",
 * "CODE is on its way", "CODE was cancelled".
 */
export function orderSms(kind: OrderSmsEvent, o: OrderSmsInput) {
  const collect = o.fulfilment === "COLLECT";
  switch (kind) {
    case "placed":
      return sms(
        collect
          ? `order ${o.code} received for collection at ${o.storeName}. We'll text you when it's ready${o.paid === false ? " - pay at the counter" : ""}. Track: ${o.link}`
          : `order ${o.code} received for delivery. We'll text you when it's on its way. Track: ${o.link}`,
      );
    case "ready":
      return sms(`order ${o.code} is ready at ${o.storeName}. Show code ${o.collectionCode ?? ""} and your ID (18+) to collect${o.paid === false ? "; pay at the counter" : ""}. ${o.link}`);
    case "dispatched":
      return sms(
        `order ${o.code} is on its way${o.trackingNo ? ` (${o.courier ?? "courier"} tracking ${o.trackingNo})` : ""}.${o.ageRestricted ? " Have your ID (18+) ready for the driver." : ""} Track: ${o.link}`,
      );
    case "delivered":
      return sms(`order ${o.code} delivered. Thanks - your points have been added. ${o.link}`);
    case "collected":
      return sms(`order ${o.code} complete. Thanks - your points have been added. ${o.link}`);
    case "cancelled":
      return sms(`order ${o.code} was cancelled. Any payment or points used have been returned. ${o.link}`);
  }
}
