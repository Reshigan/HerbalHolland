// Shared pieces for the brand videos: the page skeleton, the mark, captions, the end card and a small keyframe
// builder. A scene is plain HTML + CSS animations; render.tsx steps `Animation.currentTime` frame by frame, so
// everything here must be driven by CSS animations (or by `window.tick(t)`, for the few bits CSS can't do).
import { readFileSync } from "node:fs";
import { PETAL } from "../../src/components/brand/logo";

export type Ctx = { w: number; h: number; portrait: boolean };
export type Scene = {
  name: string;
  seconds: number;
  html: (ctx: Ctx) => Promise<string> | string;
  /** Optional soundtrack: the body of an async browser function `(seconds, rate)` returning an AudioBuffer from an
   *  OfflineAudioContext (render.tsx runs it in the page and muxes it as AAC). */
  audio?: string;
};

export const ORANGE = "#F5913C", BLACK = "#0C0A09", CREAM = "#F4EDE4";
/** Slow, elegant: an expo-out. */
export const EASE = "cubic-bezier(.16,1,.3,1)";
export const EASE_IO = "cubic-bezier(.65,0,.35,1)";
export const EASE_BOUNCE = "cubic-bezier(.34,1.56,.64,1)";
/** The short join link (herbalholland.com redirects it to Rewards sign-up on the shop). */
export const JOIN_URL = "herbalholland.com/join";

const font = readFileSync(new URL("../../node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2", import.meta.url)).toString("base64");

export const dataUri = (path: string, type = "image/webp") => `data:${type};base64,${readFileSync(path).toString("base64")}`;

/** Collects generated @keyframes so each scene can tween elements over a known window of the timeline. */
export class Build {
  private kf: string[] = [];
  private n = 0;
  constructor(public ctx: Ctx, public total: number) {}

  /** Visible from `from` to `to` seconds: enters, holds, exits. Returns the `animation:` declaration. */
  win(from: number, to: number, o: { enter?: string; hold?: string; exit?: string; inS?: number; outS?: number; ease?: string } = {}) {
    const { enter = "opacity:0;transform:translateY(2.4vmin)", hold = "opacity:1;transform:none", exit = "opacity:0;transform:translateY(-1.6vmin)", inS = 0.7, outS = 0.5, ease = EASE } = o;
    const dur = Math.max(0.1, to - from);
    const a = Math.min(99, (inS / dur) * 100), b = Math.max(a + 0.01, 100 - (outS / dur) * 100);
    const id = `w${this.n++}`;
    this.kf.push(`@keyframes ${id}{0%{${enter}}${a.toFixed(2)}%{${hold}}${b.toFixed(2)}%{${hold}}100%{${exit}}}`);
    return `animation:${id} ${dur}s ${ease} both ${from}s;`;
  }
  /** A one-shot tween between two states. */
  tween(from: number, to: number, start: string, end: string, ease = EASE, extra = "") {
    const id = `t${this.n++}`;
    this.kf.push(`@keyframes ${id}{from{${start}}to{${end}}}`);
    return `animation:${id} ${Math.max(0.05, to - from)}s ${ease} both ${from}s${extra};`;
  }
  /** A looping keyframe set (the name is returned so the caller writes its own `animation:`). */
  loop(body: string) {
    const id = `l${this.n++}`;
    this.kf.push(`@keyframes ${id}{${body}}`);
    return id;
  }
  css() {
    return this.kf.join("\n");
  }
}

/** The windmill mark, drawn with currentColor. Classes: .ring .tower .tower2 (pathLength 1, for draw-in), .spin > .pop (the petals). */
export function mark(cls = "") {
  const petals = [45, 135, 225, 315].map((r) => `<path d="${PETAL}" transform="rotate(${r - 90})" stroke-width="3.6"/>`).join("");
  return `<svg viewBox="0 0 100 100" class="mark ${cls}" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path class="ring" pathLength="1" d="M 36.2 82.6 A 40 40 0 1 1 63.8 82.6"/>
<path class="tower" pathLength="1" d="M 33 91 L 50 44.5 L 67 91"/>
<path class="tower2" pathLength="1" d="M 42.5 91 L 50 69 L 57.5 91" stroke-width="3.2"/>
<g transform="translate(50 40)"><g class="spin"><g class="pop">${petals}<circle r="3.4" stroke-width="2.4"/><circle r=".9" fill="currentColor" stroke="none"/></g></g></g>
</svg>`;
}

/** Mark that draws itself in from `at` (ring, tower, then the petals pop and keep turning). */
export function markDrawCss(b: Build, sel: string, at: number, spinSeconds = 26) {
  const spin = b.loop("from{transform:rotate(0)}to{transform:rotate(360deg)}");
  return `
${sel} .ring,${sel} .tower,${sel} .tower2{stroke-dasharray:1 1}
${sel} .ring{${b.tween(at, at + 1.9, "stroke-dashoffset:1;opacity:0", "stroke-dashoffset:0;opacity:1", EASE_IO)}}
${sel} .tower{${b.tween(at + 0.7, at + 2.3, "stroke-dashoffset:1;opacity:0", "stroke-dashoffset:0;opacity:1", EASE_IO)}}
${sel} .tower2{${b.tween(at + 1.1, at + 2.5, "stroke-dashoffset:1;opacity:0", "stroke-dashoffset:0;opacity:1", EASE_IO)}}
${sel} .spin,${sel} .pop{transform-box:fill-box;transform-origin:center}
${sel} .pop{${b.tween(at + 1.3, at + 3.6, "transform:scale(0) rotate(-300deg);opacity:0", "transform:scale(1) rotate(0);opacity:1")}}
${sel} .spin{animation:${spin} ${spinSeconds}s linear infinite ${at}s}
`;
}

/** Burned-in captions: [from, to, text]. Kept inside the social safe area. */
export function captions(b: Build, rows: [number, number, string][]) {
  return `<div class="caps">${rows
    .map(([from, to, text]) => `<div class="cap" style="${b.win(from, to, { enter: "opacity:0;transform:translateY(1.6vmin)", exit: "opacity:0;transform:translateY(-1vmin)", inS: 0.5, outS: 0.4 })}"><span>${text}</span></div>`)
    .join("")}</div>`;
}

/** The end card: mark, "Join free", the URL and "Adults 18+". Fades in at `at` and stays to the end. */
export function endCard(b: Build, at: number) {
  const css = `
.end{position:absolute;inset:0;background:${BLACK};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;${b.tween(at, at + 0.9, "opacity:0", "opacity:1", EASE_IO)}}
.end .mark{width:22vmin;height:22vmin;color:${ORANGE}}
.end .join{margin-top:5vmin;font-weight:300;font-size:7.4vmin;letter-spacing:-.01em;color:${CREAM};${b.win(at + 0.5, b.total + 5)}}
.end .url{margin-top:1.6vmin;font-weight:700;font-size:4.9vmin;letter-spacing:-.01em;color:${ORANGE};white-space:nowrap;${b.win(at + 0.8, b.total + 5)}}
.end .age{position:absolute;left:0;right:0;bottom:${b.ctx.portrait ? 14 : 7}vmin;font-weight:600;font-size:2.9vmin;letter-spacing:.24em;text-transform:uppercase;color:#bdb3a9;${b.win(at + 1.1, b.total + 5)}}
.end .wm{margin-top:1.6vmin;font-size:2.6vmin;letter-spacing:.3em;text-transform:uppercase;color:#8c8077;font-weight:500;${b.win(at + 1.2, b.total + 5)}}
${markDrawCss(b, ".end", at + 0.2)}`;
  const html = `<div class="end">${mark()}<div class="join">Join free</div><div class="url">${JOIN_URL}</div><div class="wm">Herbal Holland Rewards</div><div class="age">Adults 18+</div></div>`;
  return { css, html };
}

/** Wraps a scene body in the page: font, tokens, type scale, caption and stage styles. */
export function page(ctx: Ctx, b: Build, body: string, css: string, tick = "") {
  const capBottom = ctx.portrait ? "21vh" : "7vh";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Outfit;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900;font-display:block}
:root{--orange:${ORANGE};--black:${BLACK};--cream:${CREAM};--ink900:#141110;--ink850:#1a1614;--ink800:#211c19;--ink700:#2f2824;--ink600:#4a403a;--ink450:#8c8077;--ink300:#bdb3a9;--ink200:#ddd5cc}
*{box-sizing:border-box}
html,body{margin:0;width:${ctx.w}px;height:${ctx.h}px;overflow:hidden;background:var(--black);color:var(--cream);font-family:Outfit,system-ui,sans-serif;-webkit-font-smoothing:antialiased;font-feature-settings:"tnum"}
.stage{position:absolute;inset:0;overflow:hidden}
.abs{position:absolute}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.h1{font-weight:700;font-size:11vmin;line-height:1;letter-spacing:-.025em;color:var(--cream)}
.h1 b{color:var(--orange);font-weight:700}
.light{font-weight:300}
.eyebrow{font-weight:600;font-size:3vmin;letter-spacing:.24em;text-transform:uppercase;color:var(--orange)}
.sub{font-weight:400;font-size:4.2vmin;color:var(--ink300);letter-spacing:-.005em}
.caps{position:absolute;left:0;right:0;bottom:${capBottom};display:flex;justify-content:center;pointer-events:none}
.cap{position:absolute;bottom:0;max-width:${ctx.portrait ? 88 : 70}%;text-align:center}
.cap span{display:inline-block;background:rgba(20,17,16,.88);color:var(--cream);font-weight:600;font-size:4.3vmin;line-height:1.25;padding:1.7vmin 3.6vmin;border-radius:999px;box-shadow:0 0 0 .18vmin rgba(245,145,60,.28)}
${css}
${b.css()}
</style></head><body><div class="stage">${body}</div><script>window.tick=${tick || "function(){}"};</script></body></html>`;
}

/** Ease-out expo for JS-driven counters (runs in the page). */
export const TICK_HELPERS = `var ease=function(x){return x>=1?1:1-Math.pow(2,-10*x)};var clamp=function(t,a,b){return Math.max(0,Math.min(1,(t-a)/(b-a)))};var fmt=function(n){return new Intl.NumberFormat("en-US").format(Math.round(n))};var txt=function(id,s){var e=document.getElementById(id);if(e&&e.textContent!==s)e.textContent=s};`;
