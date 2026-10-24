// launch: the WhatsApp Status / Reels launch film (28 s, with sound). Cold open on the wordmark, the story in one
// breath, a tour of the store (concept renders, labelled as such), the visit on a floor plan, the four KZN towns,
// then the short join link. Cuts land on the beat of its own soundtrack (120 bpm, one beat = 0.5 s), synthesised in
// the page so there is nothing to license. No prices, no products close up, no THC, no claims.
import { Build, dataUri, EASE, EASE_IO, mark, markDrawCss, page, Scene, JOIN_URL } from "./scene";

const SECONDS = 28;
const asset = (f: string) => dataUri(new URL(`./assets/${f}`, import.meta.url).pathname, "image/jpeg");
// The tour: [file, width/height, from, to, eyebrow, headline]
const SHOTS: [string, number, number, number, string, string][] = [
  ["store-wide.jpg", 2330 / 665, 9, 12, "Step inside", "Warm light, dark oak, <b>room to browse.</b>"],
  ["store-merch.jpg", 1170 / 700, 12, 14.5, "Wear the Windmill", "Our own <b>apparel and gear.</b>"],
  ["store-display.jpg", 1110 / 700, 14.5, 17, "On the shelves", "CBD wellness, skin care <b>and more.</b>"],
];
const VISIT = ["Show your ID at the door. Members 18+.", "Browse wellness, skin care and gear.", "Ask our team anything.", "Join free and earn points at the till."];
const TOWNS: [string, string][] = [["Bluff", "Open now"], ["Pietermaritzburg", "Open now"], ["Hillcrest", "1 December"], ["Hilton", "1 December"]];

/** Text that rises out of a mask, letter by letter. */
const letters = (b: Build, text: string, at: number, step = 0.035) =>
  [...text].map((c, i) => `<span style="display:inline-block;${b.tween(at + i * step, at + i * step + 0.9, "opacity:0;filter:blur(1.4vmin);transform:translateY(3vmin)", "opacity:1;filter:blur(0);transform:none")}">${c === " " ? "&nbsp;" : c}</span>`).join("");
/** A line that slides up from behind its own edge, then away again. */
const line = (b: Build, html: string, from: number, to: number, cls = "") =>
  `<div class="ln ${cls}"><div style="${b.win(from, to, { enter: "transform:translateY(110%)", hold: "transform:none", exit: "transform:translateY(-110%)", inS: 0.7, outS: 0.45, ease: EASE })}">${html}</div></div>`;

function html(ctx: { w: number; h: number; portrait: boolean }) {
  const b = new Build(ctx, SECONDS);
  const P = ctx.portrait;
  const cardW = P ? Math.round(ctx.w * 0.92) : Math.round(ctx.w * 0.8);
  const cardH = P ? Math.round(ctx.h * 0.43) : Math.round(ctx.h * 0.72);

  const shots = SHOTS.map(([file, aspect, from, to, eyebrow, head], i) => {
    const src = asset(file);
    const imgW = Math.round(cardH * aspect), pan = Math.max(0, imgW - cardW);
    const dir = i % 2 ? 1 : -1;
    return {
      bg: `<div class="bg" style="background-image:url(${src});${b.win(from - 0.2, to + 0.2, { enter: "opacity:0", hold: "opacity:1", exit: "opacity:0", inS: 0.4, outS: 0.4 })}"></div>`,
      card: `<div class="card" style="${b.win(from, to, { enter: "opacity:0;transform:translateX(40vw) rotateY(-24deg) scale(.92);filter:blur(1vmin)", hold: "opacity:1;transform:none;filter:blur(0)", exit: "opacity:0;transform:translateX(-40vw) rotateY(18deg) scale(.94);filter:blur(1vmin)", inS: 0.5, outS: 0.4, ease: EASE })}">
  <img src="${src}" style="width:${imgW}px;${b.tween(from, to, `transform:translateX(${dir < 0 ? 0 : -pan}px) scale(1.06)`, `transform:translateX(${dir < 0 ? -pan : 0}px) scale(1)`, "cubic-bezier(.3,.1,.3,1)")}">
  <div class="glint" style="${b.tween(from + 0.35, from + 1.4, "transform:translateX(-120%) skewX(-18deg)", "transform:translateX(220%) skewX(-18deg)", EASE_IO)}"></div>
  <div class="shade"></div><div class="tag">Store concept</div>
  <div class="cap"><div class="eyebrow" style="${b.win(from + 0.3, to)}">${eyebrow}</div><div class="h1 hd" style="${b.win(from + 0.45, to, { enter: "opacity:0;transform:translateY(3vmin)" })}">${head}</div></div>
</div>`,
    };
  });

  // The floor plan (viewBox 600×380): walls with the entrance gap, shelving, the centre table, the counter, the lounge.
  const plan = [
    "M 40 40 H 560 V 340 H 330", "M 250 340 H 40 V 40", // walls, entrance gap 250–330 at the front
    "M 330 340 A 80 80 0 0 0 250 260", // the door swing
    "M 60 60 H 300 V 90 H 60 Z", "M 60 110 H 90 V 250 H 60 Z", // shelving: back wall and left wall
    "M 220 160 H 360 V 220 H 220 Z", // centre table
    "M 420 70 H 540 V 110 H 420 Z", // the counter
    "M 450 240 h 36 v 36 h -36 Z", "M 500 240 h 36 v 36 h -36 Z", // lounge chairs
  ];
  const pins: [number, number][] = [[290, 300], [120, 130], [290, 190], [480, 90]];
  const route = `path("M 290 330 L 290 300 L 120 130 L 290 190 L 480 90")`;
  const pS = 18.1; // first pin
  const planCss = plan.map((_, i) => `.plan path:nth-of-type(${i + 1}){${b.tween(17.2 + i * 0.09, 17.2 + i * 0.09 + 0.9, "stroke-dashoffset:1", "stroke-dashoffset:0", EASE_IO)}}`).join("\n");

  const css = `
.stage{perspective:180vmin}
.grain{position:absolute;inset:-10%;width:120%;height:120%;opacity:.07;mix-blend-mode:overlay;pointer-events:none;z-index:50}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(12,10,9,0) 45%,rgba(12,10,9,.75) 100%);pointer-events:none;z-index:40}
.leak{position:absolute;width:120vmin;height:120vmin;border-radius:50%;background:radial-gradient(closest-side,rgba(245,145,60,.22),rgba(245,145,60,0));mix-blend-mode:screen;pointer-events:none;z-index:30}
.flash{position:absolute;inset:0;background:radial-gradient(circle at center,#fff3e6,#F5913C 60%,rgba(245,145,60,0));pointer-events:none;z-index:45;opacity:0}
.ln{overflow:hidden;line-height:1.08;padding-bottom:.08em}
.ln>div{will-change:transform}
.hd{font-size:${P ? 8.2 : 6.4}vmin;line-height:1.04}

/* 0-3 cold open */
.open{${b.win(0, 3.05, { enter: "opacity:1", hold: "opacity:1", exit: "opacity:0", outS: 0.15 })};gap:3vmin}
.open .mark{width:16vmin;height:16vmin;color:var(--orange)}
${markDrawCss(b, ".open", 0.2, 18)}
.sweep{position:absolute;left:0;right:0;top:${P ? 62 : 70}%;height:.35vmin;background:linear-gradient(90deg,rgba(245,145,60,0),#F5913C 50%,rgba(245,145,60,0));box-shadow:0 0 3vmin #F5913C;${b.win(0.1, 2.4, { enter: "transform:scaleX(0);opacity:1", hold: "transform:scaleX(1);opacity:.9", exit: "transform:scaleX(1);opacity:0", inS: 1.2, outS: 0.8, ease: EASE_IO })}}
.wm{text-transform:uppercase;text-align:center;line-height:.95;color:var(--cream)}
.wm .a{display:block;font-weight:300;font-size:${P ? 11 : 10}vmin;letter-spacing:.2em;padding-left:.2em}
.wm .c{display:block;font-weight:800;font-size:${P ? 11 : 10}vmin;letter-spacing:.08em;padding-left:.08em}
.flash.f1{${b.win(2.85, 3.5, { enter: "opacity:0", hold: "opacity:.85", exit: "opacity:0", inS: 0.15, outS: 0.45, ease: EASE_IO })}}
.flash.f2{${b.win(20.85, 21.5, { enter: "opacity:0", hold: "opacity:.7", exit: "opacity:0", inS: 0.15, outS: 0.45, ease: EASE_IO })}}

/* 3-7 the story */
.story{${b.win(3, 7.05, { enter: "opacity:0", hold: "opacity:1", exit: "opacity:0", inS: 0.04, outS: 0.3 })};padding:0 8vmin}
.story .eyebrow{${b.win(3.15, 6.8)};margin-bottom:3vmin}
.story .big{font-weight:700;font-size:${P ? 12 : 10}vmin;letter-spacing:-.03em;color:var(--cream)}
.story .big b{color:var(--orange)}
.lines{position:relative;height:${P ? 30 : 26}vmin;width:100%}
.lines .grp{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center}
.hills{position:absolute;left:-10%;right:-10%;bottom:0;height:${P ? 38 : 46}%;${b.win(3, 9.2, { enter: "opacity:0;transform:translateY(6vmin)", hold: "opacity:1;transform:none", exit: "opacity:0", inS: 1.2, outS: 0.6 })}}
.hills svg{width:100%;height:100%}
.ridge1{${b.tween(3, 9, "transform:translateX(0)", "transform:translateX(-4%)", "linear")}}
.ridge2{${b.tween(3, 9, "transform:translateX(0)", "transform:translateX(-8%)", "linear")}}
.sun{transform-box:fill-box;transform-origin:center;${b.tween(3, 8.5, "transform:translateY(40%)", "transform:translateY(0)", EASE)}}

/* 7-9 introducing */
.intro{${b.win(7, 9.1, { enter: "opacity:0", hold: "opacity:1", inS: 0.04, exit: "opacity:0;transform:scale(1.06)", outS: 0.35 })};padding:0 7vmin;z-index:5}
.intro .eyebrow{${b.win(7.1, 9)};margin-bottom:2.4vmin}
.intro .h1{font-size:${P ? 11 : 9.5}vmin}

/* 9-17 the tour */
.bg{position:absolute;inset:-6%;background-size:cover;background-position:center;filter:blur(4vmin) brightness(.32) saturate(1.2)}
.cardwrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform-style:preserve-3d}
.card{position:absolute;width:${cardW}px;height:${cardH}px;border-radius:3.2vmin;overflow:hidden;box-shadow:0 5vmin 14vmin rgba(0,0,0,.75),0 0 0 .2vmin rgba(245,145,60,.35);background:#111}
.card img{position:absolute;left:0;top:0;height:100%;transform-origin:center}
.glint{position:absolute;top:-10%;bottom:-10%;left:0;width:30%;background:linear-gradient(90deg,rgba(255,240,225,0),rgba(255,240,225,.28),rgba(255,240,225,0));mix-blend-mode:screen}
.shade{position:absolute;inset:0;background:linear-gradient(rgba(12,10,9,0) 45%,rgba(12,10,9,.92))}
.tag{position:absolute;left:3vmin;top:3vmin;font-size:2.1vmin;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--cream);background:rgba(12,10,9,.55);border:.2vmin solid rgba(244,237,228,.25);border-radius:999px;padding:.9vmin 2vmin}
.card .cap{position:absolute;left:4.4vmin;right:4.4vmin;bottom:4vmin}
.card .cap .eyebrow{margin-bottom:1.4vmin}

/* 17-21 the visit */
.visit{${b.win(17, 21.05, { enter: "opacity:0;transform:scale(.97)", hold: "opacity:1;transform:none", exit: "opacity:0", inS: 0.4, outS: 0.2 })};gap:${P ? 3.4 : 2}vmin;padding:0 6vmin;${P ? "" : "flex-direction:row;gap:6vmin"}}
.visit .head{display:flex;flex-direction:column;align-items:${P ? "center" : "flex-start"};${P ? "" : "text-align:left"}}
.visit .eyebrow{${b.win(17.1, 21)}}
.visit .h1{margin-top:1.6vmin;font-size:${P ? 10 : 8}vmin;${b.win(17.25, 21, { enter: "opacity:0;transform:translateY(3vmin)" })}}
.plan{width:${P ? 86 : 52}vmin;overflow:visible}
.plan path{fill:none;stroke:var(--ink300);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 1}
.plan path:nth-of-type(-n+2){stroke:var(--cream);stroke-width:3.4}
${planCss}
.pin circle{fill:var(--orange)}
.pin text{fill:var(--black);font-weight:800;font-size:15px;text-anchor:middle;dominant-baseline:central}
.pin{transform-box:fill-box;transform-origin:center}
${pins.map((_, i) => `.pin:nth-of-type(${i + 1}){${b.tween(pS + i * 0.55, pS + i * 0.55 + 0.5, "transform:scale(0)", "transform:scale(1)", "cubic-bezier(.34,1.56,.64,1)")}}`).join("\n")}
.walker{offset-path:${route};offset-rotate:0deg;fill:#fff;filter:drop-shadow(0 0 6px #F5913C);${b.tween(pS - 0.2, pS + 0.55 * 3 + 0.3, "offset-distance:0%;opacity:1", "offset-distance:100%;opacity:1", "cubic-bezier(.45,0,.55,1)")}}
.steps{display:flex;flex-direction:column;gap:${P ? 1.8 : 1.6}vmin;width:${P ? 84 : 60}vmin}
.st{display:flex;align-items:center;gap:2.4vmin;font-size:${P ? 4.2 : 3.2}vmin;color:var(--cream);font-weight:500}
.st i{flex:none;width:5.4vmin;height:5.4vmin;border-radius:50%;background:var(--orange);color:var(--black);display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:2.8vmin}
${VISIT.map((_, i) => `.st:nth-child(${i + 1}){${b.win(pS + i * 0.55 + 0.1, 21, { enter: "opacity:0;transform:translateX(4vmin)" })}}`).join("\n")}

/* 21-25 the towns */
.towns{${b.win(21, 25.05, { enter: "opacity:0", hold: "opacity:1", inS: 0.04, exit: "opacity:0;transform:scale(1.04)", outS: 0.3 })};padding:0 7vmin;gap:${P ? 2.2 : 1.4}vmin}
.towns .eyebrow{${b.win(21.1, 25)};margin-bottom:1.6vmin}
.town{display:flex;align-items:baseline;justify-content:space-between;gap:3vmin;width:${P ? 84 : 70}vmin;border-bottom:.25vmin solid rgba(244,237,228,.14);padding-bottom:${P ? 1.6 : 1}vmin}
.town b{font-size:${P ? 7.6 : 6}vmin;font-weight:700;letter-spacing:-.02em;color:var(--cream)}
.town span{font-size:${P ? 3 : 2.6}vmin;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--orange);white-space:nowrap}
${TOWNS.map((_, i) => `.town.t${i}{${b.win(21.2 + i * 0.25, 25, { enter: "opacity:0;transform:translateY(4vmin)" })}}`).join("\n")}
.online{margin-top:${P ? 3 : 2}vmin;font-size:${P ? 9 : 7.4}vmin;font-weight:300;color:var(--cream);${b.win(23, 25, { enter: "opacity:0;transform:translateY(3vmin)" })}}
.online b{font-weight:800;color:var(--orange)}

/* 25-28 join */
.join{${b.tween(25, 25.4, "opacity:0", "opacity:1", EASE_IO)};background:var(--black);gap:2.4vmin;z-index:20}
.join .mark{width:${P ? 26 : 22}vmin;height:${P ? 26 : 22}vmin;color:var(--orange)}
${markDrawCss(b, ".join", 25.05, 22)}
.join .j{margin-top:2vmin;font-size:${P ? 8 : 7}vmin;font-weight:300;color:var(--cream);${b.win(25.5, SECONDS + 5)}}
.join .u{font-size:${P ? 8.4 : 7.4}vmin;font-weight:800;letter-spacing:-.02em;color:var(--orange);white-space:nowrap;${b.win(25.8, SECONDS + 5, { enter: "opacity:0;transform:scale(.9)", hold: "opacity:1;transform:none", ease: "cubic-bezier(.34,1.56,.64,1)" })}}
.join .s{font-size:${P ? 3 : 2.6}vmin;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--ink300);${b.win(26.2, SECONDS + 5)}}
.leak.l1{left:-40vmin;top:-30vmin;${b.tween(0, SECONDS, "transform:translate(0,0)", "transform:translate(50vmin,60vmin)", "linear")}}
.leak.l2{right:-50vmin;bottom:-40vmin;${b.tween(0, SECONDS, "transform:translate(0,0)", "transform:translate(-40vmin,-50vmin)", "linear")}}
`;

  const hills = `<svg viewBox="0 0 1000 400" preserveAspectRatio="none">
<g class="sun"><clipPath id="sc"><rect x="0" y="0" width="1000" height="230"/></clipPath><g clip-path="url(#sc)"><circle cx="500" cy="235" r="120" fill="#F5913C" opacity=".95"/>${[150, 170, 188, 204, 218].map((y) => `<rect x="360" y="${y}" width="280" height="${(y - 140) / 16}" fill="#0C0A09"/>`).join("")}</g></g>
<path class="ridge1" d="M -100 260 C 80 180 200 230 320 200 C 450 165 560 240 700 205 C 830 172 930 215 1100 190 V 400 H -100 Z" fill="#211c19"/>
<path class="ridge2" d="M -100 320 C 100 260 260 300 420 270 C 580 240 700 300 860 275 C 960 260 1040 280 1150 270 V 400 H -100 Z" fill="#141110"/>
</svg>`;

  const body = `
<div class="leak l1"></div><div class="leak l2"></div>
${shots.map((s) => s.bg).join("")}
<div class="sweep"></div>
<div class="center open">${mark()}<div class="wm"><span class="a">${letters(b, "Herbal", 0.9)}</span><span class="c">${letters(b, "Holland", 1.15)}</span></div></div>
<div class="hills">${hills}</div>
<div class="center story"><div class="eyebrow">Our story</div>
  <div class="lines"><div class="grp">${line(b, "From the hills", 3.15, 5.1, "big")}${line(b, "behind <b>Durban,</b>", 3.45, 5.1, "big")}</div>
  <div class="grp">${line(b, "to Amsterdam,", 5.05, 7.0, "big")}${line(b, "and <b>home again.</b>", 5.85, 7.0, "big")}</div></div></div>
<div class="center intro"><div class="eyebrow">Introducing</div>${line(b, "The Herbal Holland", 7.25, 9.0, "h1")}${line(b, "<b>store.</b>", 7.5, 9.0, "h1")}</div>
<div class="cardwrap">${shots.map((s) => s.card).join("")}</div>
<div class="center visit"><div class="head"><div class="eyebrow">What to expect</div><div class="h1">Your <b>visit.</b></div></div>
  <svg class="plan" viewBox="0 0 600 380">${plan.map((d) => `<path d="${d}" pathLength="1"/>`).join("")}
    ${pins.map(([x, y], i) => `<g class="pin"><circle cx="${x}" cy="${y}" r="17"/><text x="${x}" y="${y}">${i + 1}</text></g>`).join("")}
    <circle class="walker" r="6"/></svg>
  <div class="steps">${VISIT.map((v, i) => `<div class="st"><i>${i + 1}</i>${v}</div>`).join("")}</div></div>
<div class="center towns"><div class="eyebrow">KwaZulu-Natal</div>${TOWNS.map(([t, s], i) => `<div class="town t${i}"><b>${t}</b><span>${s}</span></div>`).join("")}<div class="online">And <b>online.</b></div></div>
<div class="center join">${mark()}<div class="j">Join free</div><div class="u">${JOIN_URL}</div><div class="s">Members only · Adults 18+</div></div>
<div class="flash f1"></div><div class="flash f2"></div>
<div class="vig"></div>
<svg class="grain"><filter id="gn"><feTurbulence id="turb" type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="1"/></filter><rect width="100%" height="100%" filter="url(#gn)"/></svg>`;
  const tick = `function(t){var e=document.getElementById("turb");if(e)e.setAttribute("seed",String(Math.floor(t*24)%97+1));}`;
  return page(ctx, b, body, css, tick);
}

// The soundtrack: A minor, Am-F-C-G at 120 bpm. A drone and riser into an impact on the first cut (3 s), a beat that
// builds through the story, drops into the tour at 9 s, a second impact at 21 s, and a held chord under the end card.
const audio = `
const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
const comp = ctx.createDynamicsCompressor();
comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
const master = ctx.createGain(); master.gain.value = 0.8;
master.gain.setValueAtTime(0.8, seconds - 1.8); master.gain.linearRampToValueAtTime(0.0001, seconds - 0.05);
master.connect(comp); comp.connect(ctx.destination);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const ir = ctx.createBuffer(2, rate * 2.8, rate);
for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * Math.pow(1 - i / d.length, 3.2); }
const verb = ctx.createConvolver(); verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(master);
const delay = ctx.createDelay(1); delay.delayTime.value = 0.375; const fb = ctx.createGain(); fb.gain.value = 0.38;
const dl = ctx.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 3200;
delay.connect(dl); dl.connect(fb); fb.connect(delay); const dw = ctx.createGain(); dw.gain.value = 0.3; dl.connect(dw); dw.connect(master); dw.connect(verb);
const noise = ctx.createBuffer(1, rate * 2, rate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd(); }
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const out = (node, pan = 0, send = 0) => { const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(master); if (send) { const s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(verb); } return p; };
const env = (g, t, a, peak, d, sus = 0.0001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d); };
const noiseSrc = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.abs(rnd())); s.stop(t + dur); return s; };

function kick(t, amp = 0.9) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  env(g, t, 0.002, amp, 0.42); o.connect(g); out(g); o.start(t); o.stop(t + 0.5);
  const c = noiseSrc(t, 0.03), h = ctx.createBiquadFilter(), cg = ctx.createGain(); h.type = "highpass"; h.frequency.value = 2500;
  env(cg, t, 0.001, amp * 0.12, 0.02); c.connect(h); h.connect(cg); out(cg);
}
function hat(t, amp = 0.09, open = false) {
  const s = noiseSrc(t, open ? 0.3 : 0.08), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "highpass"; f.frequency.value = 7500;
  env(g, t, 0.002, amp, open ? 0.25 : 0.05); s.connect(f); f.connect(g); out(g, 0.25, 0.05);
}
function clap(t, amp = 0.28) {
  const s = noiseSrc(t, 0.35), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 0.9;
  g.gain.setValueAtTime(0.0001, t); [0, 0.012, 0.024].forEach((o) => { g.gain.setValueAtTime(amp, t + o); g.gain.exponentialRampToValueAtTime(amp * 0.25, t + o + 0.01); });
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); s.connect(f); f.connect(g); out(g, -0.1, 0.35);
}
function bass(t, m, dur, amp = 0.32) {
  const o = ctx.createOscillator(), sub = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = "sawtooth"; o.frequency.value = hz(m); sub.frequency.value = hz(m); f.type = "lowpass"; f.Q.value = 6;
  f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + dur);
  env(g, t, 0.006, amp, dur, 0.0001); o.connect(f); sub.connect(g); f.connect(g); out(g); [o, sub].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
}
function pad(t, notes, dur, amp = 0.05, cutoff = 1400) {
  notes.forEach((m, i) => [-7, 7].forEach((cents, j) => {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = cents; f.type = "lowpass"; f.frequency.value = cutoff; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amp, t + Math.min(0.6, dur / 3)); g.gain.setValueAtTime(amp, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
    o.connect(f); f.connect(g); out(g, (i - 1) * 0.35 + (j ? 0.15 : -0.15), 0.5); o.start(t); o.stop(t + dur + 0.5);
  }));
}
function pluck(t, m, amp = 0.07) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.value = hz(m);
  env(g, t, 0.003, amp, 0.35); o.connect(g); const p = out(g, rnd() * 0.5, 0.2); const s = ctx.createGain(); s.gain.value = 0.6; p.connect(s); s.connect(delay); o.start(t); o.stop(t + 0.5);
}
function riser(t0, t1, amp = 0.22) {
  const s = noiseSrc(t0, t1 - t0 + 0.05), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.Q.value = 2.5;
  f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(7000, t1);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(amp, t1 - 0.02); g.gain.linearRampToValueAtTime(0.0001, t1 + 0.03);
  s.connect(f); f.connect(g); out(g, 0, 0.4);
}
function whoosh(t, amp = 0.2) {
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

const B = 0.5, BAR = 2;
const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
const roots = [33, 29, 36, 31];
// 0-3: drone, shimmer, riser, impact
pad(0, [45, 52, 57], 3.2, 0.035, 700);
[0.9, 1.15, 1.4, 1.65, 1.9, 2.15].forEach((t, i) => pluck(t, [69, 72, 76, 79, 76, 81][i], 0.05));
riser(0.4, 3.0); impact(3.0);
// 3-21: four bars a cycle from 3 s
for (let bar = 0; bar < 9; bar++) {
  const t0 = 3 + bar * BAR, k = bar % 4;
  pad(t0, chords[k], BAR, t0 < 9 ? 0.04 : 0.05, t0 < 9 ? 900 : 1600);
  for (let beat = 0; beat < 4; beat++) {
    const t = t0 + beat * B;
    const build = t >= 7 && t < 9;
    if (t >= 3 && !build) kick(t, t < 5 ? 0.6 : 0.85);
    if (build && beat % 2 === 0) kick(t, 0.5);
    if (t >= 5) bass(t + B / 2, roots[k] + (beat === 3 ? 12 : 0), 0.22, t < 9 ? 0.22 : 0.3);
    if (t >= 9) { hat(t + B / 2, 0.08); hat(t + B / 4, 0.03); hat(t + (3 * B) / 4, 0.03); if (beat % 2) clap(t); }
    if (t >= 9) pluck(t + (beat % 2 ? B / 2 : 0), chords[k][(bar + beat) % 3] + 12, 0.05);
  }
}
riser(7, 9, 0.18); whoosh(9); whoosh(12); whoosh(14.5); whoosh(17, 0.16);
impact(21, 0.7); riser(19.5, 21, 0.15);
// 21-25: the towns, the beat back with the progression
for (let bar = 0; bar < 2; bar++) {
  const t0 = 21 + bar * BAR, k = bar % 4;
  pad(t0, chords[k], BAR, 0.05, 1800);
  for (let beat = 0; beat < 4; beat++) { const t = t0 + beat * B; kick(t, 0.85); bass(t + B / 2, roots[k], 0.22); hat(t + B / 2, 0.08); if (beat % 2) clap(t); }
}
// 25-28: the end card, a held A minor and a bell for the mark
whoosh(25, 0.14); pad(25, [45, 57, 60, 64, 69], 3.2, 0.045, 1300); bass(25, 33, 2.5, 0.25);
[25.1, 25.35, 25.6].forEach((t, i) => pluck(t, [81, 84, 88][i], 0.06));
return ctx.startRendering();
`;

export const launch: Scene = { name: "launch", seconds: SECONDS, html, audio };
