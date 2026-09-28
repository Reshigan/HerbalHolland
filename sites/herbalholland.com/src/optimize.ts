// Build-time size work on the shipped CSS and HTML; the sources stay readable and token-based.
//   1. color-mix() of design tokens → the exact colour (OKLab maths, as the browser would), so the CSS ships hex;
//   2. design-token custom properties (:root) → short names;
//   3. class names → short names, identically in the CSS (all its chunks) and in every page. A class any script names
//      (adds, toggles or queries) keeps its name, so the scripts need no mapping;
//   4. a page's CSS → only the rules that page can use (a rule whose selector needs a class the page never has, and no
//      script adds, is left out), so each page ships its own stylesheet and nothing it doesn't need.

import ts from "typescript";

// ── 1. color-mix() ───────────────────────────────────────────────────────────
type RGB = [number, number, number];
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklab([r, g, b]: RGB): RGB {
  const [R, G, B] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function rgb([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((c) => Math.min(1, Math.max(0, gam(c)))) as RGB;
}
const parse = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB;
const hex2 = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
const toHex = (c: RGB, alpha = 1) => `#${c.map(hex2).join("")}${alpha < 1 ? hex2(alpha) : ""}`;

/** The :root tokens that hold a plain hex colour. */
function tokens(css: string) {
  const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
  return new Map([...root.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

export function precomputeColors(css: string) {
  const T = tokens(css);
  return css.replace(/color-mix\(in oklab,\s*var\(--([\w-]+)\)\s+([\d.]+)%,\s*(transparent|var\(--([\w-]+)\))\)/g, (m, a: string, pct: string, other: string, b?: string) => {
    const A = T.get(a);
    const p = Number(pct) / 100;
    if (!A) return m;
    // Mixing with transparent keeps the colour and scales its alpha (premultiplied interpolation).
    if (other === "transparent") return toHex(parse(A), p);
    const B = b && T.get(b);
    if (!B) return m;
    const [x, y] = [oklab(parse(A)), oklab(parse(B))];
    return toHex(rgb([0, 1, 2].map((i) => x[i] * p + y[i] * (1 - p)) as RGB));
  });
}

// ── 2. Tokens ────────────────────────────────────────────────────────────────
export function shortenTokens(css: string) {
  const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
  const decl = new Map([...root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const uses = (n: string) => css.split(`var(--${n})`).length - 1;
  // A plain colour token used only once is cheaper written out where it's used.
  const inline = new Set([...decl].filter(([n, v]) => /^#[0-9a-f]+$/i.test(v) && uses(n) <= 1).map(([n]) => n));
  let out = css;
  for (const n of inline) out = out.replace(`var(--${n})`, decl.get(n)!).replace(new RegExp(`--${n}\\s*:[^;]+;\\s*`), "");
  const map = new Map([...decl.keys()].filter((n) => !inline.has(n)).map((n, i) => [n, `z${i.toString(36)}`]));
  return out.replace(/--([\w-]+)/g, (m, n: string) => (map.has(n) ? `--${map.get(n)}` : m));
}

/** What the minifier leaves: the space after a custom property's colon, "transparent" (#0000) and spaced slashes. */
export function tighten(css: string) {
  const urls: string[] = [];
  return css
    .replace(/url\([^)]*\)/g, (u) => `\u0000${urls.push(u) - 1}\u0000`)
    .replace(/([{;]--[\w-]+):\s+/g, "$1:")
    .replace(/\btransparent\b/g, "#0000")
    .replace(/ \/ /g, "/")
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => urls[Number(i)]);
}

// ── 3. Class names ───────────────────────────────────────────────────────────
const shortName = (n: number) => {
  const A = "abcdefghijklmnopqrstuvwxyz";
  let s = "";
  do {
    s = A[n % 26] + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

/** Every string literal (and template-literal text) in a script, read with TypeScript's scanner. */
export function literals(src: string) {
  const sc = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, src);
  const out: string[] = [];
  const braces: boolean[] = []; // true = the brace that closes a template's ${ … }
  const K = ts.SyntaxKind;
  for (let k = sc.scan(); k !== K.EndOfFileToken; k = sc.scan()) {
    if (k === K.OpenBraceToken) braces.push(false);
    else if (k === K.CloseBraceToken && braces.pop()) k = sc.reScanTemplateToken(false);
    if (k === K.TemplateHead || k === K.TemplateMiddle) braces.push(true);
    if (k === K.StringLiteral || k === K.NoSubstitutionTemplateLiteral || k === K.TemplateHead || k === K.TemplateMiddle || k === K.TemplateTail) out.push(sc.getTokenValue());
  }
  return out;
}

const hideUrls = (css: string) => {
  const urls: string[] = [];
  return { text: css.replace(/url\([^)]*\)/g, (u) => `\u0000${urls.push(u) - 1}\u0000`), restore: (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => urls[Number(i)]) };
};

/**
 * Short class names, identically in every CSS chunk and every page. Returns the chunks and pages renamed, and the set
 * of names the scripts use (kept as they are, and treated as present on every page when pruning).
 */
export function mangleClasses(chunks: string[], pages: string[], scriptStrings: string[]) {
  const css = chunks.join("\n");
  const count = new Map<string, number>();
  const bump = (c: string, k = 1) => count.set(c, (count.get(c) ?? 0) + k);
  for (const h of pages) for (const m of h.matchAll(/\sclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) bump(c);
  const inCss = new Set([...css.replace(/url\([^)]*\)/g, "").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  // A class any script names (in a string: a selector, or a class it adds or toggles) keeps its name.
  const strings = scriptStrings.join(" ");
  const named = (c: string) => new RegExp(`(^|[^\\w-])${c.replace(/[-]/g, "\\-")}(?![\\w-])`).test(strings);
  const keep = new Set([...count.keys(), ...inCss].filter(named));
  const taken = new Set([...count.keys(), ...inCss]);
  const map = new Map<string, string>();
  let n = 0;
  for (const [c] of [...count].filter(([c]) => !keep.has(c) && inCss.has(c)).sort((a, b) => b[1] - a[1])) {
    let s: string;
    do s = shortName(n++);
    while (taken.has(s));
    map.set(c, s);
  }
  // Classes in the pages that no CSS rule uses are dropped from the markup.
  const unused = new Set([...count.keys()].filter((c) => !inCss.has(c) && !keep.has(c)));
  const out = chunks.map((chunk) => {
    const { text, restore } = hideUrls(chunk);
    return restore(text.replace(/\.(-?[_a-zA-Z][\w-]*)/g, (m, c: string) => (map.has(c) ? `.${map.get(c)}` : m)));
  });
  const html = pages.map((h) =>
    h.replace(/\sclass="([^"]*)"/g, (_, v: string) => {
      const cls = v.split(/\s+/).filter((c) => c && !unused.has(c)).map((c) => map.get(c) ?? c);
      return cls.length ? ` class="${cls.join(" ")}"` : "";
    }),
  );
  return { css: out, pages: html, keep, renamed: map.size };
}

// ── 4. A page's own CSS ──────────────────────────────────────────────────────
/** The class names a page's markup carries. */
export const classesIn = (html: string) => new Set([...html.matchAll(/\sclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));

/** Splits a selector list at its top-level commas. */
function selectors(list: string) {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) (out.push(cur), (cur = ""));
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * The rules of a minified stylesheet that a page can use: a selector that names a class the page doesn't have (and no
 * script adds) is dropped; a rule with no selector left is dropped; an empty at-rule block is dropped. @font-face,
 * @property, @keyframes, @view-transition and the like are kept as they are.
 */
export function pruneCss(css: string, present: Set<string>) {
  const { text, restore } = hideUrls(css);
  const usable = (sel: string) => [...sel.replace(/\[[^\]]*\]/g, "").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].every((m) => present.has(m[1]));
  const walk = (src: string): string => {
    let out = "";
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i);
      if (open < 0) break;
      const head = src.slice(i, open).trim();
      // Find the matching close brace.
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        j++;
      }
      const body = src.slice(open + 1, j - 1);
      i = j;
      if (head.startsWith("@")) {
        if (/^@(media|supports|container|layer)\b/.test(head)) {
          const inner = walk(body);
          if (inner) out += `${head}{${inner}}`;
        } else out += `${head}{${body}}`; // @font-face, @property, @keyframes, @view-transition, @page …
        continue;
      }
      const kept = selectors(head).filter(usable);
      if (kept.length) out += `${kept.join(",")}{${body}}`;
    }
    return out;
  };
  return restore(walk(text));
}
