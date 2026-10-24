// launch: the launch film for Hillcrest and Hilton, "Holland, meet the Hills". The brand's first hello, so it tells
// the story first: a seed from the hills behind Durban, a home in Holland where cannabis culture grew up, and the
// journey back, fifty years on. Then the store (concept renders, labelled as such), the Founding card and the short
// join link. Two cuts from one timeline: `launch` (44 s master) and `launch-30` (30 s, for WhatsApp Status). Cuts land
// on the beat of its own soundtrack (120 bpm, one beat = 0.5 s), synthesised in the page so nothing needs a licence.
// Words: cannabis for the story and the culture; the products named are CBD only. No THC products, prices or claims.
import { Build, dataUri, EASE, EASE_IO, mark, markDrawCss, page, Scene, JOIN_URL } from "./scene";

type Part = "open" | "seed" | "holland" | "home" | "hills" | "tour" | "founding" | "end";
const ORDER: Part[] = ["open", "seed", "holland", "home", "hills", "tour", "founding", "end"];
const CUTS: Record<"launch" | "launch-30", Record<Part, number>> = {
  launch: { open: 4, seed: 5, holland: 5, home: 4, hills: 4, tour: 12, founding: 5, end: 5 },
  "launch-30": { open: 3, seed: 3.5, holland: 3.5, home: 3, hills: 3, tour: 7.5, founding: 3.5, end: 3 },
};
/** Each part's [start, end] in seconds. */
const timeline = (d: Record<Part, number>) => {
  let t = 0;
  return Object.fromEntries(ORDER.map((p) => [p, [t, (t += d[p])]])) as Record<Part, [number, number]>;
};

const asset = (f: string) => dataUri(new URL(`./assets/${f}`, import.meta.url).pathname, "image/jpeg");
// The tour: [file, width/height, eyebrow, headline]
const SHOTS: [string, number, string, string][] = [
  ["store-wide.jpg", 2330 / 665, "Members only", "A members' club for <b>cannabis culture.</b>"],
  ["store-display.jpg", 1110 / 700, "On the shelves", "CBD wellness <b>and coffee.</b>"],
  ["store-merch.jpg", 1170 / 700, "Wear it, grow it", "Apparel, accessories, <b>and learn to grow.</b>"],
];

/** Letters that sharpen into place one by one. */
const letters = (b: Build, text: string, at: number, step = 0.035) =>
  [...text].map((c, i) => `<span style="display:inline-block;${b.tween(at + i * step, at + i * step + 0.9, "opacity:0;filter:blur(1.4vmin);transform:translateY(3vmin)", "opacity:1;filter:blur(0);transform:none")}">${c === " " ? "&nbsp;" : c}</span>`).join("");
/** A line that slides up from behind its own edge, then away again. */
const line = (b: Build, html: string, from: number, to: number, cls = "") =>
  `<div class="ln ${cls}"><div style="${b.win(from, to, { enter: "transform:translateY(110%)", hold: "transform:none", exit: "transform:translateY(-110%)", inS: 0.7, outS: 0.45, ease: EASE })}">${html}</div></div>`;
/** A section that cuts in and out (hidden before and after its window). */
const cut = (b: Build, [from, to]: [number, number], exit = "opacity:0") => b.win(from, to + 0.05, { enter: "opacity:0", hold: "opacity:1", exit, inS: 0.04, outS: 0.3 });

function film(cutName: keyof typeof CUTS): Scene {
  const T = timeline(CUTS[cutName]);
  const SECONDS = T.end[1];
  const short = cutName === "launch-30";

  function html(ctx: { w: number; h: number; portrait: boolean }) {
    const b = new Build(ctx, SECONDS);
    const P = ctx.portrait;
    const cardW = P ? Math.round(ctx.w * 0.92) : Math.round(ctx.w * 0.8);
    const cardH = P ? Math.round(ctx.h * 0.43) : Math.round(ctx.h * 0.72);
    const [o0] = T.open, [s0, s1] = T.seed, [h0, h1] = T.holland, [m0, m1] = T.home, [k0, k1] = T.hills, [t0, t1] = T.tour, [f0, f1] = T.founding, [e0] = T.end;
    const shotLen = (t1 - t0) / SHOTS.length;

    const shots = SHOTS.map(([file, aspect, eyebrow, head], i) => {
      const src = asset(file);
      const from = t0 + i * shotLen, to = from + shotLen;
      const imgW = Math.round(cardH * aspect), pan = Math.max(0, imgW - cardW);
      const ltr = i % 2 === 0;
      return {
        bg: `<div class="bg" style="background-image:url(${src});${b.win(from - 0.2, to + 0.2, { enter: "opacity:0", hold: "opacity:1", exit: "opacity:0", inS: 0.4, outS: 0.4 })}"></div>`,
        card: `<div class="card" style="${b.win(from, to, { enter: "opacity:0;transform:translateX(40vw) rotateY(-24deg) scale(.92);filter:blur(1vmin)", hold: "opacity:1;transform:none;filter:blur(0)", exit: "opacity:0;transform:translateX(-40vw) rotateY(18deg) scale(.94);filter:blur(1vmin)", inS: 0.5, outS: 0.4, ease: EASE })}">
  <img src="${src}" style="width:${imgW}px;${b.tween(from, to, `transform:translateX(${ltr ? 0 : -pan}px) scale(1.06)`, `transform:translateX(${ltr ? -pan : 0}px) scale(1)`, "cubic-bezier(.3,.1,.3,1)")}">
  <div class="glint" style="${b.tween(from + 0.35, from + 1.4, "transform:translateX(-120%) skewX(-18deg)", "transform:translateX(220%) skewX(-18deg)", EASE_IO)}"></div>
  <div class="shade"></div><div class="tag">Store concept</div>
  <div class="cap"><div class="eyebrow" style="${b.win(from + 0.3, to)}">${eyebrow}</div><div class="h1 hd" style="${b.win(from + 0.45, to, { enter: "opacity:0;transform:translateY(3vmin)" })}">${head}</div></div>
</div>`,
      };
    });

    // Amsterdam in line art: a row of gabled canal houses and a windmill, drawn in.
    const houses = [
      "M 40 300 V 170 L 60 150 V 130 H 80 V 150 L 100 170 V 300", "M 100 300 V 150 Q 130 110 160 150 V 300", "M 160 300 V 160 L 175 145 L 190 130 L 205 145 L 220 160 V 300",
      "M 220 300 V 140 H 235 V 120 H 265 V 140 H 280 V 300", "M 280 300 V 165 L 310 125 L 340 165 V 300",
      "M 380 300 L 395 190 H 425 L 440 300", "M 410 190 L 410 120", "M 410 155 L 360 120", "M 410 155 L 460 190", "M 410 155 L 445 105", "M 410 155 L 375 205",
      "M 0 300 H 500", "M 0 318 H 500",
    ];
    const windows = [[60, 200], [60, 245], [122, 195], [122, 245], [182, 200], [182, 245], [242, 180], [242, 240], [302, 200], [302, 245]];

    const css = `
.stage{perspective:180vmin}
.grain{position:absolute;inset:-10%;width:120%;height:120%;opacity:.07;mix-blend-mode:overlay;pointer-events:none;z-index:50}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(12,10,9,0) 45%,rgba(12,10,9,.75) 100%);pointer-events:none;z-index:40}
.leak{position:absolute;width:120vmin;height:120vmin;border-radius:50%;background:radial-gradient(closest-side,rgba(245,145,60,.2),rgba(245,145,60,0));mix-blend-mode:screen;pointer-events:none;z-index:30}
.leak.l1{left:-40vmin;top:-30vmin;${b.tween(0, SECONDS, "transform:translate(0,0)", "transform:translate(50vmin,60vmin)", "linear")}}
.leak.l2{right:-50vmin;bottom:-40vmin;${b.tween(0, SECONDS, "transform:translate(0,0)", "transform:translate(-40vmin,-50vmin)", "linear")}}
.flash{position:absolute;inset:0;background:radial-gradient(circle at center,#fff3e6,#F5913C 60%,rgba(245,145,60,0));pointer-events:none;z-index:45;opacity:0;${b.win(k0 - 0.15, k0 + 0.5, { enter: "opacity:0", hold: "opacity:.8", exit: "opacity:0", inS: 0.15, outS: 0.45, ease: EASE_IO })}}
.ln{overflow:hidden;line-height:1.1;padding-bottom:.08em}
.ln>div{will-change:transform}
.big{font-weight:700;font-size:${P ? 10.5 : 8.6}vmin;letter-spacing:-.03em;color:var(--cream)}
.big b{color:var(--orange)}
.sub2{margin-top:3vmin;font-size:${P ? 4.4 : 3.6}vmin;font-weight:400;color:var(--ink300)}
.hd{font-size:${P ? 7.6 : 6}vmin;line-height:1.05}
.pad{padding:0 8vmin}

/* the cold open: wind, the mark, the name */
.open{${cut(b, T.open)};gap:3vmin}
.open .mark{width:16vmin;height:16vmin;color:var(--orange)}
${markDrawCss(b, ".open", o0 + 0.2, 18)}
.wm{text-transform:uppercase;text-align:center;line-height:.95;color:var(--cream)}
.wm .a{display:block;font-weight:300;font-size:${P ? 11 : 10}vmin;letter-spacing:.2em;padding-left:.2em}
.wm .c{display:block;font-weight:800;font-size:${P ? 11 : 10}vmin;letter-spacing:.08em;padding-left:.08em}

/* the seed: the hills at dawn, a spark drifting north */
.seed{${cut(b, T.seed)}}
.seed .eyebrow{${b.win(s0 + 0.15, s1)};margin-bottom:3vmin}
.seed .sub2{${b.win(s0 + 1.2, s1)}}
.hillsart{position:absolute;left:-10%;right:-10%;bottom:0;height:${P ? 36 : 44}%}
.hillsart.a1{${b.win(s0, s1 + 0.3, { enter: "opacity:0;transform:translateY(6vmin)", hold: "opacity:1;transform:none", exit: "opacity:0", inS: 1.2, outS: 0.6 })}}
.hillsart.a2{${b.win(m0 - 0.2, m1, { enter: "opacity:0;transform:translateY(6vmin)", hold: "opacity:1;transform:none", exit: "opacity:0", inS: 1, outS: 0.4 })}}
.hillsart svg{width:100%;height:100%}
.r1{${b.tween(s0, m1, "transform:translateX(0)", "transform:translateX(-4%)", "linear")}}
.r2{${b.tween(s0, m1, "transform:translateX(0)", "transform:translateX(-8%)", "linear")}}
.sun{transform-box:fill-box;transform-origin:center;${b.tween(s0, m1, "transform:translateY(45%)", "transform:translateY(0)", EASE)}}
.seeddot{position:absolute;left:50%;top:${P ? 74 : 72}%;width:1.6vmin;height:1.6vmin;border-radius:50%;background:var(--orange);box-shadow:0 0 3vmin 1vmin rgba(245,145,60,.6);${b.win(s0 + 0.8, s1, { enter: "opacity:0;transform:translate(0,0)", hold: "opacity:1;transform:translate(14vmin,-30vmin)", exit: "opacity:0;transform:translate(40vmin,-70vmin)", inS: 2.2, outS: 1.2, ease: EASE_IO })}}

/* Holland: canal houses and a windmill, drawn in */
.holland{${cut(b, T.holland)}}
.holland .eyebrow{${b.win(h0 + 0.15, h1)};margin-bottom:3vmin}
.holland .sub2{${b.win(h0 + 1.2, h1)}}
.ams{position:absolute;left:50%;bottom:${P ? 6 : 4}%;width:${P ? 92 : 70}vmin;transform:translateX(-50%);overflow:visible}
.ams path{fill:none;stroke:var(--ink300);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 1}
.ams path:nth-of-type(n+6):nth-of-type(-n+11){stroke:var(--orange)}
.ams rect{fill:var(--orange)}
${houses.map((_, i) => `.ams path:nth-of-type(${i + 1}){${b.tween(h0 + 0.1 + i * 0.07, h0 + 1.2 + i * 0.07, "stroke-dashoffset:1", "stroke-dashoffset:0", EASE_IO)}}`).join("\n")}
${windows.map((_, i) => `.ams rect:nth-of-type(${i + 1}){${b.tween(h0 + 1.2 + i * 0.08, h0 + 1.5 + i * 0.08, "opacity:0", "opacity:.85")}}`).join("\n")}

/* home */
.home{${cut(b, T.home)}}
.home .eyebrow{${b.win(m0 + 0.15, m1)};margin-bottom:3vmin}
.home .sub2{${b.win(m0 + 1.1, m1)}}

/* Holland, meet the Hills */
.hills{${cut(b, T.hills, "opacity:0;transform:scale(1.05)")}}
.hills .h1{font-size:${P ? 13 : 11}vmin;${b.win(k0 + 0.05, k1, { enter: "opacity:0;transform:scale(1.15);filter:blur(1vmin)", hold: "opacity:1;transform:none;filter:blur(0)", inS: 0.8 })}}
.hills .towns{margin-top:4vmin;font-size:${P ? 5 : 4.2}vmin;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--orange);${b.win(k0 + 0.9, k1)}}

/* the tour */
.bg{position:absolute;inset:-6%;background-size:cover;background-position:center;filter:blur(4vmin) brightness(.32) saturate(1.2)}
.cardwrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform-style:preserve-3d}
.card{position:absolute;width:${cardW}px;height:${cardH}px;border-radius:3.2vmin;overflow:hidden;box-shadow:0 5vmin 14vmin rgba(0,0,0,.75),0 0 0 .2vmin rgba(245,145,60,.35);background:#111}
.card img{position:absolute;left:0;top:0;height:100%;transform-origin:center}
.glint{position:absolute;top:-10%;bottom:-10%;left:0;width:30%;background:linear-gradient(90deg,rgba(255,240,225,0),rgba(255,240,225,.28),rgba(255,240,225,0));mix-blend-mode:screen}
.shade{position:absolute;inset:0;background:linear-gradient(rgba(12,10,9,0) 40%,rgba(12,10,9,.92))}
.tag{position:absolute;left:3vmin;top:3vmin;font-size:2.1vmin;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--cream);background:rgba(12,10,9,.55);border:.2vmin solid rgba(244,237,228,.25);border-radius:999px;padding:.9vmin 2vmin}
.card .cap{position:absolute;left:4.4vmin;right:4.4vmin;bottom:4vmin}
.card .cap .eyebrow{margin-bottom:1.4vmin}

/* the Founding card */
.founding{${cut(b, T.founding)};gap:${P ? 4 : 3}vmin}
.fcard{width:${P ? 70 : 52}vmin;aspect-ratio:1.586;border-radius:4vmin;background:linear-gradient(135deg,#1f1a16,#0c0a09 60%,#15110f);border:.5vmin solid var(--orange);box-shadow:0 4vmin 12vmin rgba(0,0,0,.7),0 0 6vmin rgba(245,145,60,.25);padding:4vmin;display:flex;flex-direction:column;justify-content:space-between;color:var(--cream);${b.win(f0, f1, { enter: "opacity:0;transform:perspective(120vmin) rotateY(-80deg) scale(.8)", hold: "opacity:1;transform:perspective(120vmin) rotate(-3deg)", exit: "opacity:1;transform:perspective(120vmin) rotate(-3deg)", inS: 0.9, ease: EASE })}}
.fcard .top{display:flex;justify-content:space-between;align-items:center;font-size:${P ? 2.4 : 2}vmin;letter-spacing:.22em;text-transform:uppercase;color:var(--orange);font-weight:600}
.fcard .mark{width:7vmin;height:7vmin;color:var(--orange)}
.fcard .no{font-size:${P ? 11 : 9}vmin;font-weight:700;letter-spacing:-.03em;line-height:1}
.fcard .no small{font-weight:300;color:var(--orange);font-size:.6em}
.fcard .bt{font-size:${P ? 2.2 : 1.9}vmin;letter-spacing:.2em;text-transform:uppercase;color:var(--ink300)}
.founding .h1{font-size:${P ? 9 : 7.4}vmin;${b.win(f0 + 0.5, f1, { enter: "opacity:0;transform:translateY(3vmin)" })}}
.founding .sub2{margin-top:0;${b.win(f0 + 0.9, f1)}}

/* the end card */
.end{${b.tween(e0, e0 + 0.4, "opacity:0", "opacity:1", EASE_IO)};background:var(--black);gap:2.2vmin;z-index:20}
.end .mark{width:${P ? 24 : 20}vmin;height:${P ? 24 : 20}vmin;color:var(--orange)}
${markDrawCss(b, ".end", e0 + 0.05, 22)}
.end .o1{font-size:${P ? 3.2 : 2.8}vmin;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--orange);${b.win(e0 + 0.3, SECONDS + 5)}}
.end .twn{font-size:${P ? 6.4 : 5.4}vmin;font-weight:700;color:var(--cream);${b.win(e0 + 0.4, SECONDS + 5)}}
.end .j{margin-top:2vmin;font-size:${P ? 5.4 : 4.6}vmin;font-weight:300;color:var(--cream);${b.win(e0 + 0.6, SECONDS + 5)}}
.end .u{font-size:${P ? 8.4 : 7.2}vmin;font-weight:800;letter-spacing:-.02em;color:var(--orange);white-space:nowrap;${b.win(e0 + 0.8, SECONDS + 5, { enter: "opacity:0;transform:scale(.9)", hold: "opacity:1;transform:none", ease: "cubic-bezier(.34,1.56,.64,1)" })}}
.end .s{font-size:${P ? 2.9 : 2.5}vmin;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--ink300);${b.win(e0 + 1.1, SECONDS + 5)}}
`;

    const hills = `<svg viewBox="0 0 1000 400" preserveAspectRatio="none">
<g class="sun"><clipPath id="sc"><rect x="0" y="0" width="1000" height="230"/></clipPath><g clip-path="url(#sc)"><circle cx="500" cy="235" r="120" fill="#F5913C" opacity=".95"/>${[150, 170, 188, 204, 218].map((y) => `<rect x="360" y="${y}" width="280" height="${(y - 140) / 16}" fill="#0C0A09"/>`).join("")}</g></g>
<path class="r1" d="M -100 260 C 80 180 200 230 320 200 C 450 165 560 240 700 205 C 830 172 930 215 1100 190 V 400 H -100 Z" fill="#211c19"/>
<path class="r2" d="M -100 320 C 100 260 260 300 420 270 C 580 240 700 300 860 275 C 960 260 1040 280 1150 270 V 400 H -100 Z" fill="#141110"/>
</svg>`;

    const body = `
<div class="leak l1"></div><div class="leak l2"></div>
${shots.map((s) => s.bg).join("")}
<div class="hillsart a1">${hills}</div><div class="hillsart a2">${hills}</div>
<div class="seeddot"></div>
<div class="center open">${mark()}<div class="wm"><span class="a">${letters(b, "Herbal", o0 + 0.9)}</span><span class="c">${letters(b, "Holland", o0 + 1.15)}</span></div></div>
<div class="center seed pad"><div class="eyebrow">The 1970s</div>${line(b, "Some stories <b>travel.</b>", s0 + 0.2, s1, "big")}<div class="sub2">A seed left the hills behind Durban…</div></div>
<div class="center holland pad"><div class="eyebrow">Amsterdam</div>${line(b, "…and found a home", h0 + 0.2, h1, "big")}${line(b, "in <b>Holland,</b>", h0 + 0.45, h1, "big")}<div class="sub2">where cannabis culture grew up.</div>
  <svg class="ams" viewBox="0 0 500 330">${houses.map((p) => `<path d="${p}" pathLength="1"/>`).join("")}${windows.map(([x, y]) => `<rect x="${x}" y="${y}" width="12" height="18" rx="2"/>`).join("")}</svg></div>
<div class="center home pad"><div class="eyebrow">${short ? "Now" : "Fifty years on"}</div>${line(b, "It's coming <b>home.</b>", m0 + 0.2, m1, "big")}<div class="sub2">Dutch heritage. African soil.</div></div>
<div class="center hills pad"><div class="h1">Holland,<br>meet <b>the Hills.</b></div><div class="towns">Hillcrest · Hilton</div></div>
<div class="cardwrap">${shots.map((s) => s.card).join("")}</div>
<div class="center founding pad"><div class="fcard"><div class="top">${mark()}<span>Founding Member</span></div><div class="no"><small>#</small>0001</div><div class="bt">Herbal Holland Rewards</div></div>
  <div class="h1">Be a <b>founding member.</b></div><div class="sub2">The first 2,026 get a numbered card. Free for adults 18+.</div></div>
<div class="center end">${mark()}<div class="o1">Opening 1 December</div><div class="twn">Hillcrest · Hilton</div><div class="j">Join free</div><div class="u">${JOIN_URL}</div><div class="s">Members only · Adults 18+</div></div>
<div class="flash"></div>
<div class="vig"></div>
<svg class="grain"><filter id="gn"><feTurbulence id="turb" type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="1"/></filter><rect width="100%" height="100%" filter="url(#gn)"/></svg>`;
    const tick = `function(t){var e=document.getElementById("turb");if(e)e.setAttribute("seed",String(Math.floor(t*24)%97+1));}`;
    return page(ctx, b, body, css, tick);
  }

  // The soundtrack, on the same timeline, South African: wind and a drone under the open, the story on jazzy keys that
  // gathers shakers and a first log drum by "coming home", an impact on "Holland, meet the Hills", a full amapiano
  // groove (log drum, shakers, clave, keys) under the tour and the Founding card, and Am9 held under the end card.
  const audio = `
const T = ${JSON.stringify(T)};
const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
const comp = ctx.createDynamicsCompressor();
comp.threshold.value = -20; comp.knee.value = 6; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
const master = ctx.createGain(); master.gain.value = 0.8;
master.gain.setValueAtTime(0.8, seconds - 1.6); master.gain.linearRampToValueAtTime(0.0001, seconds - 0.05);
master.connect(comp); comp.connect(ctx.destination);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const ir = ctx.createBuffer(2, rate * 2.8, rate);
for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * Math.pow(1 - i / d.length, 3.2); }
const verb = ctx.createConvolver(); verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.34; verb.connect(wet); wet.connect(master);
const delay = ctx.createDelay(1); delay.delayTime.value = 0.375; const fb = ctx.createGain(); fb.gain.value = 0.38;
const dl = ctx.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 3200;
delay.connect(dl); dl.connect(fb); fb.connect(delay); const dw = ctx.createGain(); dw.gain.value = 0.3; dl.connect(dw); dw.connect(master); dw.connect(verb);
const noise = ctx.createBuffer(1, rate * 2, rate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd(); }
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const out = (node, pan = 0, send = 0) => { const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(master); if (send) { const s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(verb); } return p; };
const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
const noiseSrc = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.abs(rnd())); s.stop(t + dur); return s; };

function kick(t, amp = 0.85) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  env(g, t, 0.002, amp, 0.42); o.connect(g); out(g); o.start(t); o.stop(t + 0.5);
}
function hat(t, amp = 0.08) {
  const s = noiseSrc(t, 0.08), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "highpass"; f.frequency.value = 7500;
  env(g, t, 0.002, amp, 0.05); s.connect(f); f.connect(g); out(g, 0.25, 0.05);
}
function clap(t, amp = 0.26) {
  const s = noiseSrc(t, 0.35), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 0.9;
  g.gain.setValueAtTime(0.0001, t); [0, 0.012, 0.024].forEach((o) => { g.gain.setValueAtTime(amp, t + o); g.gain.exponentialRampToValueAtTime(amp * 0.25, t + o + 0.01); });
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); s.connect(f); f.connect(g); out(g, -0.1, 0.35);
}
function bass(t, m, dur, amp = 0.3) {
  const o = ctx.createOscillator(), sub = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = "sawtooth"; o.frequency.value = hz(m); sub.frequency.value = hz(m); f.type = "lowpass"; f.Q.value = 6;
  f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + dur);
  env(g, t, 0.006, amp, dur); o.connect(f); sub.connect(g); f.connect(g); out(g); [o, sub].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
}
function pad(t, notes, dur, amp = 0.05, cutoff = 1400) {
  notes.forEach((m, i) => [-7, 7].forEach((cents, j) => {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = cents; f.type = "lowpass"; f.frequency.value = cutoff; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amp, t + Math.min(0.8, dur / 3)); g.gain.setValueAtTime(amp, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    o.connect(f); f.connect(g); out(g, (i - 1) * 0.35 + (j ? 0.15 : -0.15), 0.5); o.start(t); o.stop(t + dur + 0.6);
  }));
}
function pluck(t, m, amp = 0.07) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.value = hz(m);
  env(g, t, 0.003, amp, 0.4); o.connect(g); const p = out(g, rnd() * 0.5, 0.25); const s = ctx.createGain(); s.gain.value = 0.6; p.connect(s); s.connect(delay); o.start(t); o.stop(t + 0.6);
}
function wind(t0, t1, amp = 0.12) {
  const s = noiseSrc(t0, t1 - t0), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.Q.value = 0.8;
  f.frequency.setValueAtTime(500, t0);
  for (let t = t0 + 0.5; t < t1; t += 0.5) f.frequency.linearRampToValueAtTime(400 + 500 * (0.5 + 0.5 * Math.sin(t * 2.1)), t);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.8); g.gain.linearRampToValueAtTime(0.0001, t1);
  s.connect(f); f.connect(g); out(g, 0, 0.3);
}
function riser(t0, t1, amp = 0.2) {
  const s = noiseSrc(t0, t1 - t0 + 0.05), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.Q.value = 2.5;
  f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(7000, t1);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(amp, t1 - 0.02); g.gain.linearRampToValueAtTime(0.0001, t1 + 0.03);
  s.connect(f); f.connect(g); out(g, 0, 0.4);
}
function whoosh(t, amp = 0.18) {
  const s = noiseSrc(t - 0.35, 0.8), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner(); f.type = "bandpass"; f.Q.value = 1.4;
  f.frequency.setValueAtTime(500, t - 0.35); f.frequency.exponentialRampToValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.4);
  g.gain.setValueAtTime(0.0001, t - 0.35); g.gain.exponentialRampToValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  p.pan.setValueAtTime(0.7, t - 0.35); p.pan.linearRampToValueAtTime(-0.7, t + 0.4);
  s.connect(f); f.connect(g); g.connect(p); p.connect(master); const v = ctx.createGain(); v.gain.value = 0.3; p.connect(v); v.connect(verb);
}
function impact(t, amp = 0.9) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
  env(g, t, 0.003, amp, 1.6); o.connect(g); out(g, 0, 0.3); o.start(t); o.stop(t + 1.8);
  const s = noiseSrc(t, 1.2), f = ctx.createBiquadFilter(), ng = ctx.createGain(); f.type = "lowpass"; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(200, t + 1);
  env(ng, t, 0.002, amp * 0.35, 1); s.connect(f); f.connect(ng); out(ng, 0, 0.8);
}

// Amapiano: the log drum (a sine with a falling pitch, driven into a soft clip), shakers on the sixteenths, a light
// kick, a clave, and jazzy seventh chords on the keys. A minor: Am9, Fmaj7, Cmaj7/G, G6.
const clip = ctx.createWaveShaper(); clip.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(2.4 * (i / 511.5 - 1)));
const ldBus = ctx.createGain(); ldBus.gain.value = 0.9; const ldLp = ctx.createBiquadFilter(); ldLp.type = "lowpass"; ldLp.frequency.value = 900;
ldBus.connect(clip); clip.connect(ldLp); out(ldLp);
function logdrum(t, m, len = 0.38, amp = 0.55) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(hz(m + 12) * 1.9, t); o.frequency.exponentialRampToValueAtTime(hz(m + 12), t + 0.045); o.frequency.exponentialRampToValueAtTime(hz(m + 12) * 0.94, t + len);
  env(g, t, 0.004, amp, len); o.connect(g); g.connect(ldBus); o.start(t); o.stop(t + len + 0.05);
}
function shaker(t, amp) {
  const s = noiseSrc(t, 0.07), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.frequency.value = 6500; f.Q.value = 1.2;
  env(g, t, 0.006, amp, 0.05); s.connect(f); f.connect(g); out(g, 0.35, 0.08);
}
function clave(t, amp = 0.09) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 2400; env(g, t, 0.001, amp, 0.05); o.connect(g); out(g, -0.3, 0.2); o.start(t); o.stop(t + 0.08);
}
function keys(t, notes, len = 0.32, amp = 0.05) {
  notes.forEach((m, i) => [["triangle", 1], ["sine", 2]].forEach(([type, mul], j) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = hz(m) * mul; o.detune.value = (i - 1) * 3;
    env(g, t, 0.006, amp * (j ? 0.3 : 1), len); o.connect(g); out(g, (i - 1.5) * 0.25, 0.35); o.start(t); o.stop(t + len + 0.1);
  }));
}
const B = 0.5, S16 = B / 4;
const chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64], [55, 60, 64, 67, 71], [55, 59, 62, 64]];
const roots = [33, 29, 31, 31];
// log drum pattern per bar (in sixteenths from the bar's start) with an octave jump: the amapiano "talk"
const LD = [[0, 0], [3, 0], [6, 12], [10, 0], [12, 7], [14, 0]];
// keys: off-beat stabs (in sixteenths)
const KEYS = [2, 6, 7, 10, 14];
// the open: wind, a low drone, the mark's shimmer on the keys
wind(T.open[0], T.seed[1], 0.11); pad(T.open[0], [45, 52], T.open[1], 0.03, 600);
[0.9, 1.15, 1.4, 1.65].forEach((o, i) => pluck(T.open[0] + o, [69, 72, 76, 81][i], 0.05));
// the story: the chords alone, then shakers creep in; a first log drum once it's coming home
for (let t = T.seed[0], k = 0; t < T.home[1] - 0.01; t += 2, k++) {
  const len = Math.min(2, T.home[1] - t), c = chords[k % 4];
  pad(t, c.slice(0, 3), len, 0.035, t >= T.holland[0] ? 1300 : 900);
  KEYS.forEach((x) => x * S16 < len && keys(t + x * S16, c, 0.3, 0.035));
  if (t >= T.holland[0]) for (let x = 0; x < len - 0.01; x += S16) shaker(t + x, x % B === 0 ? 0.03 : 0.018);
  if (t >= T.home[0]) LD.forEach(([x, o]) => x * S16 < len && logdrum(t + x * S16, roots[k % 4] + o, 0.34, 0.4));
}
whoosh(T.holland[0], 0.12); riser(T.home[0], T.hills[0], 0.22);
// Holland, meet the Hills: the drop
impact(T.hills[0]); pad(T.hills[0], [45, 57, 60, 64], T.hills[1] - T.hills[0], 0.045, 1600);
logdrum(T.hills[0] + 0.5, 33, 0.9, 0.6);
// the tour and the Founding card: the full groove
for (let t = T.tour[0], k = 0; t < T.founding[1] - 0.01; t += 2, k++) {
  const len = Math.min(2, T.founding[1] - t), c = chords[k % 4];
  pad(t, c.slice(0, 3), len, 0.035, 1500);
  for (let x = 0; x < len - 0.01; x += B) { kick(t + x, 0.6); if (Math.round(x / B) % 2) clap(t + x, 0.16); }
  for (let x = 0; x < len - 0.01; x += S16) shaker(t + x, Math.round(x / S16) % 4 === 2 ? 0.05 : 0.025);
  [0, 3, 6, 10, 12].forEach((x) => x * S16 < len && clave(t + x * S16));
  LD.forEach(([x, o]) => x * S16 < len && logdrum(t + x * S16, roots[k % 4] + o));
  KEYS.forEach((x) => x * S16 < len && keys(t + x * S16, c));
}
const shot = (T.tour[1] - T.tour[0]) / 3;
[0, 1, 2].forEach((i) => whoosh(T.tour[0] + i * shot, 0.14)); whoosh(T.founding[0], 0.12);
// the end card: Am9 held on the keys and pad, one last log drum, a bell for the mark
whoosh(T.end[0], 0.1); pad(T.end[0], [45, 57, 60, 64, 71], T.end[1] - T.end[0], 0.045, 1300);
logdrum(T.end[0], 33, 1.2, 0.5); keys(T.end[0] + 0.5, chords[0], 1.6, 0.05);
[0.1, 0.35, 0.6].forEach((o, i) => pluck(T.end[0] + o, [81, 84, 88][i], 0.06));
return ctx.startRendering();
`;
  return { name: cutName, seconds: SECONDS, html, audio };
}

export const launch: Scene = film("launch");
export const launch30: Scene = film("launch-30");
