// The eight brand videos. Each scene is HTML + CSS keyframes on a timeline in seconds (render.tsx steps the
// animations frame by frame). Brand-led only: no prices, no consumption, no medical claims; product renders appear
// only in `range`, as the-range artwork. The only call to action is the end card ("Join free").
import QRCode from "qrcode";
import { Build, captions, CREAM, dataUri, EASE, EASE_BOUNCE, EASE_IO, endCard, mark, markDrawCss, page, Scene, TICK_HELPERS } from "./scene";

const CATEGORIES = ["flower", "pre-rolls", "edibles", "vapes", "wellness", "skin-care", "coffee-drinks", "protein-nutrition", "collagen-supplements", "accessories", "apparel", "grow", "concentrates"];

// ---------------------------------------------------------------------------------------------------------------
// welcome: the mark draws itself in, the wordmark rises, "Holland, meet the Hills."
const welcome: Scene = {
  name: "welcome",
  seconds: 18,
  html(ctx) {
    const b = new Build(ctx, 18);
    const end = endCard(b, 14.2);
    const css = `
.hero{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;${b.win(0, 9.6, { enter: "opacity:1", hold: "opacity:1", exit: "opacity:0", outS: 0.8 })}}
.logo{width:42vmin;height:42vmin;color:var(--orange);${b.tween(4.8, 6.2, "transform:translateY(8vmin)", "transform:translateY(0)")}}
${markDrawCss(b, ".logo", 0.4)}
.wm{margin-top:3vmin;line-height:.92;text-transform:uppercase;text-align:center;${b.win(5.2, 9.3, { outS: 0.6 })}}
.wm span{display:block;font-weight:300;font-size:9vmin;letter-spacing:.16em;padding-left:.16em}
.wm b{display:block;font-weight:800;font-size:9vmin;letter-spacing:.07em;padding-left:.07em}
.hills{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 8vmin}
.hills .eyebrow{${b.win(9.8, 14.2)}}
.hills .h1{margin-top:3vmin;font-size:${ctx.portrait ? 13 : 12}vmin;${b.win(10.1, 14.2, { enter: "opacity:0;transform:translateY(4vmin)" })}}
.hills .sub{margin-top:3.6vmin;${b.win(10.6, 14.2)}}
.glow{position:absolute;left:50%;top:50%;width:120vmin;height:120vmin;border-radius:50%;background:radial-gradient(closest-side,rgba(245,145,60,.16),rgba(245,145,60,0));${b.tween(0, 9, "transform:translate(-50%,-50%) scale(.4);opacity:0", "transform:translate(-50%,-50%) scale(1);opacity:1", EASE_IO)}}
${end.css}`;
    const body = `
<div class="glow"></div>
<div class="hero">${mark("logo")}<div class="wm"><span>Herbal</span><b>Holland</b></div></div>
<div class="hills"><div class="eyebrow">Opening soon</div><div class="h1">Holland,<br>meet <b>the Hills.</b></div><div class="sub">Hillcrest · Hilton · KwaZulu-Natal</div></div>
${captions(b, [
  [1.0, 4.8, "Welcome to the Windmill."],
  [5.4, 9.2, "Herbal Holland, a Dutch-born brand, made at home in KwaZulu-Natal."],
  [9.9, 14.0, "Hillcrest and Hilton, opening soon."],
])}
${end.html}`;
    return page(ctx, b, body, css);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// founding: 2,026 counts up; a numbered card slides in; every friend moves you up 250 places.
const founding: Scene = {
  name: "founding",
  seconds: 20,
  html(ctx) {
    const b = new Build(ctx, 20);
    const end = endCard(b, 16);
    const cardW = ctx.portrait ? 82 : 76;
    const css = `
.count{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.count .eyebrow{${b.win(0.4, 7.4)}}
.count .num{margin-top:2vmin;font-weight:700;font-size:${ctx.portrait ? 30 : 28}vmin;line-height:1;letter-spacing:-.04em;color:var(--cream);${b.win(0.7, 7.4, { enter: "opacity:0;transform:translateY(3vmin) scale(.96)", hold: "opacity:1;transform:none", exit: "opacity:0;transform:translateY(-3vmin) scale(1.02)", outS: 0.6 })}}
.count .sub{margin-top:1vmin;font-size:5vmin;${b.win(3.0, 7.4)}}
.cardwrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;perspective:200vmin}
.card{position:relative;width:${cardW}vmin;aspect-ratio:1.586;border-radius:4vmin;background:linear-gradient(135deg,#1a1614,#0c0a09 60%,#15110f);border:.55vmin solid var(--orange);box-shadow:0 4vmin 10vmin rgba(0,0,0,.6),0 0 0 .1vmin rgba(245,145,60,.3);padding:4vmin 4.4vmin;display:flex;flex-direction:column;justify-content:space-between;color:var(--cream);overflow:hidden;${b.win(7.8, 15.9, { enter: "opacity:0;transform:translateX(70vmin) rotateY(-28deg) rotate(6deg)", hold: "opacity:1;transform:rotate(-3deg)", exit: "opacity:0;transform:translateY(-6vmin) rotate(-3deg)", inS: 1.4, outS: 0.6 })}}
.card .top{display:flex;align-items:center;justify-content:space-between}
.card .mark{width:9vmin;height:9vmin;color:var(--orange)}
.card .t{font-weight:600;font-size:2.4vmin;letter-spacing:.26em;text-transform:uppercase;color:var(--orange);text-align:right;line-height:1.5}
.card .no{font-weight:700;font-size:16vmin;line-height:1;letter-spacing:-.03em;color:var(--cream)}
.card .no small{font-weight:300;color:var(--orange);font-size:10vmin;letter-spacing:0;margin-right:.6vmin}
.card .bottom{display:flex;align-items:flex-end;justify-content:space-between;white-space:nowrap;font-size:${ctx.portrait ? 2.4 : 2.1}vmin;letter-spacing:.2em;text-transform:uppercase;color:var(--ink300);font-weight:500}
.card .sheen{position:absolute;inset:-50%;background:linear-gradient(115deg,transparent 40%,rgba(245,145,60,.14) 50%,transparent 60%);${b.tween(9.2, 11.4, "transform:translateX(-60%)", "transform:translateX(60%)", EASE_IO)}}
.boost{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:2vmin;background:var(--orange);color:var(--black);border-radius:999px;padding:1.8vmin 3.6vmin;font-weight:700;font-size:4vmin;letter-spacing:-.01em;white-space:nowrap;${b.win(11.9, 15.8, { enter: `opacity:0;transform:translate(-50%,-50%) translateY(${ctx.portrait ? -36 : -32}vmin) scale(.8)`, hold: `opacity:1;transform:translate(-50%,-50%) translateY(${ctx.portrait ? -36 : -32}vmin)`, exit: `opacity:0;transform:translate(-50%,-50%) translateY(${ctx.portrait ? -40 : -36}vmin)`, ease: EASE_BOUNCE })}}
.boost svg{width:4.2vmin;height:4.2vmin}
${end.css}`;
    const body = `
<div class="count"><div class="eyebrow">Founding Members</div><div class="num" id="n">0</div><div class="sub">numbered cards</div></div>
<div class="cardwrap"><div class="card"><div class="sheen"></div>
  <div class="top">${mark()}<div class="t">Founding<br>Member</div></div>
  <div class="no"><small>#</small><span id="cardno">0292</span></div>
  <div class="bottom"><span>Herbal Holland Rewards</span><span>Hillcrest · 2026</span></div>
</div></div>
<div class="boost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>1 friend = 250 places up</div>
${captions(b, [
  [1.0, 7.2, "The first 2,026 members get a numbered Founding card."],
  [8.2, 11.6, "Your card. Your number. Yours from day one."],
  [12.0, 15.7, "Every friend who joins with your link moves you up 250 places."],
])}
${end.html}`;
    const tick = `function(t){${TICK_HELPERS}
txt("n",fmt(2026*ease(clamp(t,0.8,4.9))));
var n=292-Math.round(250*ease(clamp(t,12.3,14.2)));txt("cardno",String(n).padStart(4,"0"));}`;
    return page(ctx, b, body, css, tick);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// lab-tested: a batch code types in, becomes a QR, and five safety panels tick.
const labTested: Scene = {
  name: "lab-tested",
  seconds: 20,
  async html(ctx) {
    const b = new Build(ctx, 20);
    const end = endCard(b, 16.2);
    const code = "HH-2609-0192";
    const qr = await QRCode.toString(`https://shop.herbalholland.com/batch/${code}`, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: CREAM, light: "#0000" } });
    const panels = ["Microbials", "Pesticides", "Heavy metals", "Mycotoxins", "Residual solvents"];
    const tick = `function(t){${TICK_HELPERS}
var code=${JSON.stringify(code)};var k=Math.round(code.length*clamp(t,0.9,3.2));txt("code",code.slice(0,k)+(k<code.length&&Math.floor(t*4)%2?"_":""));}`;
    const css = `
.eye{position:absolute;left:0;right:0;top:${ctx.portrait ? 14 : 9}vmin;text-align:center;${b.win(0.4, 15.9)}}
.p1{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;${b.win(0.6, 5.6, { enter: "opacity:0", hold: "opacity:1", exit: "opacity:0;transform:scale(.9)", outS: 0.6 })}}
.code{font-weight:600;font-size:${ctx.portrait ? 12.4 : 12.4}vmin;letter-spacing:.02em;line-height:1;color:var(--cream);min-height:1em}
.p1 .sub{margin-top:2.4vmin;${b.win(3.4, 5.6)}}
.p2{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;${b.win(5.6, 10.8, { enter: "opacity:0;transform:scale(.6)", hold: "opacity:1;transform:none", exit: "opacity:0;transform:scale(1.08)", inS: 1.2, outS: 0.6 })}}
.qrbox{position:relative;width:44vmin;height:44vmin;padding:3vmin;background:var(--ink900);border-radius:4vmin;border:.4vmin solid var(--ink700);overflow:hidden}
.qrbox svg{width:100%;height:100%;display:block}
.scan{position:absolute;left:0;right:0;height:1.2vmin;background:var(--orange);box-shadow:0 0 3vmin rgba(245,145,60,.9);${b.tween(7.0, 9.4, "top:-2vmin", "top:102%", EASE_IO)}}
.p2 .sub{margin-top:3vmin;font-size:4.4vmin;color:var(--ink300)}
.p2 .sub b{color:var(--cream);font-weight:600}
.p3{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.2vmin;${b.win(10.8, 16.1, { enter: "opacity:0", hold: "opacity:1", exit: "opacity:0", outS: 0.5 })}}
.row{display:flex;align-items:center;justify-content:space-between;width:${ctx.portrait ? 80 : 60}vmin;background:var(--ink900);border-radius:999px;padding:2vmin 2.4vmin 2vmin 4vmin;font-size:4.4vmin;font-weight:500;color:var(--cream)}
.row .tick{width:6.4vmin;height:6.4vmin;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center}
.row .tick svg{width:3.6vmin;height:3.6vmin;stroke:var(--black);stroke-width:3.2;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 1}
${panels.map((_, i) => `.row:nth-child(${i + 1}){${b.win(11 + i * 0.35, 16.1, { enter: "opacity:0;transform:translateX(-4vmin)", exit: "opacity:0", outS: 0.4 })}}
.row:nth-child(${i + 1}) .tick{${b.tween(11.6 + i * 0.35, 12.2 + i * 0.35, "transform:scale(0)", "transform:scale(1)", EASE_BOUNCE)}}
.row:nth-child(${i + 1}) .tick svg path{${b.tween(11.9 + i * 0.35, 12.5 + i * 0.35, "stroke-dashoffset:1", "stroke-dashoffset:0", EASE_IO)}}`).join("\n")}
.all{margin-top:2vmin;font-size:3.6vmin;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--orange);${b.win(13.8, 16.1)}}
${end.css}`;
    const body = `
<div class="eye eyebrow">Lab-tested, every batch</div>
<div class="p1"><div class="code" id="code"></div><div class="sub">the batch code, on every pack</div></div>
<div class="p2"><div class="qrbox">${qr}<div class="scan"></div></div><div class="sub">Batch <b>${code}</b></div></div>
<div class="p3">${panels.map((p) => `<div class="row"><span>${p}</span><span class="tick"><svg viewBox="0 0 24 24"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>`).join("")}<div class="all">Certificate on file</div></div>
${captions(b, [
  [0.9, 5.4, "Every batch has a certificate."],
  [5.9, 10.6, "Scan the code on the pack to read it."],
  [11.0, 16.0, "Tested for microbials, pesticides, heavy metals, mycotoxins and solvents."],
])}
${end.html}`;
    return page(ctx, b, body, css, tick);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// rewards: join → points → tiers. No money amounts.
const rewards: Scene = {
  name: "rewards",
  seconds: 22,
  html(ctx) {
    const b = new Build(ctx, 22);
    const end = endCard(b, 18);
    const tiers = ["Seed", "Sprout", "Bloom", "Harvest"];
    const ringLoop = b.loop("from{transform:rotate(0)}to{transform:rotate(360deg)}");
    const css = `
.eye{position:absolute;left:0;right:0;top:${ctx.portrait ? 14 : 9}vmin;text-align:center;${b.win(0.4, 17.9)}}
.rail{position:absolute;left:50%;transform:translateX(-50%);bottom:${ctx.portrait ? 36 : 23}vh;display:flex;align-items:center;gap:0;${b.win(0.6, 17.9, { enter: "opacity:0;transform:translateX(-50%) translateY(2vmin)", hold: "opacity:1;transform:translateX(-50%)", exit: "opacity:0;transform:translateX(-50%)" })}}
.node{display:flex;flex-direction:column;align-items:center;gap:1.4vmin;width:22vmin}
.node i{width:4.4vmin;height:4.4vmin;border-radius:50%;border:.5vmin solid var(--ink600);background:var(--black);display:block}
.node span{font-size:3.1vmin;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink450)}
.link{width:14vmin;height:.5vmin;background:var(--ink700);margin-bottom:5vmin;margin-left:-7vmin;margin-right:-7vmin;position:relative;overflow:hidden}
.link:after{content:"";position:absolute;inset:0;background:var(--orange);transform-origin:left}
${[0.8, 6.2, 12.2].map((t, i) => `.node:nth-of-type(${i + 1}) i{${b.tween(t, t + 0.6, "border-color:var(--ink600);background:var(--black);box-shadow:0 0 0 0 rgba(245,145,60,0)", "border-color:var(--orange);background:var(--orange);box-shadow:0 0 0 1.2vmin rgba(245,145,60,.18)")}}
.node:nth-of-type(${i + 1}) span{${b.tween(t, t + 0.6, "color:var(--ink450)", "color:var(--cream)")}}`).join("\n")}
${[5.4, 11.4].map((t, i) => `.link:nth-of-type(${i + 1}):after{${b.tween(t, t + 0.9, "transform:scaleX(0)", "transform:scaleX(1)", EASE_IO)}}`).join("\n")}
.ill{position:absolute;left:0;right:0;top:${ctx.portrait ? 28 : 16}vmin;bottom:${ctx.portrait ? 44 : 35}vh;display:grid;place-items:center;text-align:center}
.ill>div{grid-area:1/1}
.s1{${b.win(0.8, 6.0, { enter: "opacity:0;transform:scale(.9)", hold: "opacity:1;transform:none", exit: "opacity:0;transform:scale(.96)", outS: 0.5 })}}
.phone{position:relative;width:${ctx.portrait ? 30 : 22}vmin;height:${ctx.portrait ? 54 : 40}vmin;border-radius:${ctx.portrait ? 5 : 4}vmin;border:.9vmin solid var(--ink600);background:var(--ink900);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3vmin;margin:0 auto}
.phone .mark{width:12vmin;height:12vmin;color:var(--orange)}
${markDrawCss(b, ".phone", 1.0, 30)}
.phone .btn{background:var(--orange);color:var(--black);font-weight:700;font-size:3vmin;border-radius:999px;padding:1.6vmin 4vmin;${b.win(2.4, 6.0)}}
.phone .ok{position:absolute;right:-3vmin;top:-3vmin;width:10vmin;height:10vmin;border-radius:50%;background:var(--cream);display:flex;align-items:center;justify-content:center;${b.tween(3.8, 4.5, "transform:scale(0)", "transform:scale(1)", EASE_BOUNCE)}}
.phone .ok svg{width:5.5vmin;height:5.5vmin;stroke:var(--black);stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round}
.s1 .h{margin-top:${ctx.portrait ? 3.4 : 2.4}vmin;font-size:${ctx.portrait ? 6.4 : 5.4}vmin;font-weight:600;letter-spacing:-.02em}
.s2{${b.win(6.2, 12.0, { enter: "opacity:0;transform:scale(.9)", hold: "opacity:1;transform:none", exit: "opacity:0;transform:scale(.96)", outS: 0.5 })}}
.ring{position:relative;width:${ctx.portrait ? 46 : 36}vmin;height:${ctx.portrait ? 46 : 36}vmin;margin:0 auto}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:3.2;stroke-linecap:round}
.ring .bg{stroke:var(--ink800)}
.ring .fg{stroke:var(--orange);stroke-dasharray:1 1;${b.tween(6.8, 10.6, "stroke-dashoffset:1", "stroke-dashoffset:0", EASE)}}
.ring .in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring .in b{font-size:9vmin;font-weight:700;letter-spacing:-.03em;line-height:1}
.ring .in span{font-size:3vmin;letter-spacing:.24em;text-transform:uppercase;color:var(--orange);font-weight:600;margin-top:1vmin}
.ring .dot{position:absolute;left:50%;top:50%;width:${ctx.portrait ? 46 : 36}vmin;height:${ctx.portrait ? 46 : 36}vmin;margin:${ctx.portrait ? "-23vmin 0 0 -23vmin" : "-18vmin 0 0 -18vmin"};animation:${ringLoop} 9s linear infinite}
.ring .dot:after{content:"";position:absolute;left:50%;top:0;width:3vmin;height:3vmin;margin:-1.5vmin;border-radius:50%;background:var(--cream);box-shadow:0 0 2vmin rgba(244,237,228,.6)}
.s2 .h{margin-top:${ctx.portrait ? 3.4 : 2.4}vmin;font-size:${ctx.portrait ? 6.4 : 5.4}vmin;font-weight:600;letter-spacing:-.02em}
.s3{${b.win(12.2, 17.9, { enter: "opacity:0;transform:scale(.9)", hold: "opacity:1;transform:none", exit: "opacity:0", outS: 0.5 })}}
.ladder{display:flex;flex-direction:${ctx.portrait ? "column-reverse" : "row"};gap:2vmin;align-items:center;justify-content:center}
.tier{display:flex;align-items:center;gap:2vmin;border-radius:999px;padding:2vmin 4vmin 2vmin 2.4vmin;background:var(--ink900);border:.4vmin solid var(--ink700);font-size:4.6vmin;font-weight:600;min-width:${ctx.portrait ? 44 : 0}vmin}
.tier i{width:4vmin;height:4vmin;border-radius:50%;border:.5vmin solid var(--ink600);display:block}
${tiers.map((_, i) => `.tier:nth-child(${i + 1}){${b.tween(12.8 + i * 1.0, 13.5 + i * 1.0, "background:var(--ink900);border-color:var(--ink700);color:var(--cream);transform:none", "background:var(--orange);border-color:var(--orange);color:var(--black);transform:scale(1.04)")}}
.tier:nth-child(${i + 1}) i{${b.tween(12.8 + i * 1.0, 13.5 + i * 1.0, "border-color:var(--ink600);background:transparent", "border-color:var(--black);background:var(--black)")}}`).join("\n")}
.s3 .h{margin-top:${ctx.portrait ? 3.4 : 2.4}vmin;font-size:${ctx.portrait ? 6.4 : 5.4}vmin;font-weight:600;letter-spacing:-.02em}
${end.css}`;
    const body = `
<div class="eye eyebrow">Herbal Holland Rewards</div>
<div class="ill">
  <div class="s1"><div class="phone">${mark()}<div class="btn">Join free</div><div class="ok"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div></div><div class="h">Join with your number</div></div>
  <div class="s2"><div class="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" cx="50" cy="50" r="46" pathLength="1"/></svg><div class="dot"></div><div class="in"><b id="pts">0</b><span>points</span></div></div><div class="h">Points on every shop</div></div>
  <div class="s3"><div class="ladder">${tiers.map((t) => `<div class="tier"><i></i>${t}</div>`).join("")}</div><div class="h">More perks as you climb</div></div>
</div>
<div class="rail"><div class="node"><i></i><span>Join</span></div><div class="link"></div><div class="node"><i></i><span>Points</span></div><div class="link"></div><div class="node"><i></i><span>Tiers</span></div></div>
${captions(b, [
  [1.0, 5.8, "Join free with your mobile number. Adults 18+."],
  [6.4, 11.8, "Earn points every time you shop, in store or online."],
  [12.4, 17.8, "Climb from Seed to Harvest: early access, members' evenings and more."],
])}
${end.html}`;
    const tick = `function(t){${TICK_HELPERS}txt("pts",fmt(1250*ease(clamp(t,6.8,10.6))));}`;
    return page(ctx, b, body, css, tick);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// hillcrest / hilton: contour rings, a pin drops, the town name rises, "opening soon".
function town(name: string, area: string): Scene {
  return {
    name: name.toLowerCase(),
    seconds: 16,
    html(ctx) {
      const b = new Build(ctx, 16);
      const end = endCard(b, 12);
      const ripple = b.loop("0%{transform:translate(-50%,-50%) scale(.2);opacity:.9}100%{transform:translate(-50%,-50%) scale(1);opacity:0}");
      const letters = name.split("").map((ch, i) => `<span style="${b.tween(2.4 + i * 0.07, 3.6 + i * 0.07, "transform:translateY(110%)", "transform:translateY(0)")}">${ch}</span>`).join("");
      const rings = [18, 30, 44, 60, 78, 98, 120].map((r, i) => `<circle cx="50%" cy="46%" r="${r}vmin" style="${b.tween(0, 16, `transform:scale(${1 + i * 0.004})`, `transform:scale(${1.08 + i * 0.01})`, "linear")}"/>`).join("");
      const css = `
.contours{position:absolute;inset:0;width:100%;height:100%;fill:none;stroke:var(--orange);stroke-width:.25vmin;opacity:.28;${b.win(0, 12.4, { enter: "opacity:0", hold: "opacity:.28", exit: "opacity:0", inS: 1.2, outS: 0.7 })}}
.contours circle{transform-box:fill-box;transform-origin:center}
.scene{position:absolute;inset:0;${b.win(0, 12.4, { enter: "opacity:1", hold: "opacity:1", exit: "opacity:0", outS: 0.7 })}}
.pinwrap{position:absolute;left:50%;top:${ctx.portrait ? 30 : 24}%;width:0;height:0}
.pin{position:absolute;left:-9vmin;top:-24vmin;width:18vmin;height:24vmin;color:var(--orange);${b.tween(0.5, 1.7, "transform:translateY(-70vmin);opacity:0", "transform:translateY(0);opacity:1", EASE_BOUNCE)}}
.pin svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.rip{position:absolute;left:0;top:0;width:36vmin;height:12vmin;border-radius:50%;border:.6vmin solid var(--orange);animation:${ripple} 2.6s ${EASE_IO} infinite both}
.rip:nth-child(2){animation-delay:1.6s}.rip:nth-child(3){animation-delay:2.5s}.rip:nth-child(4){animation-delay:3.4s}
.shadow{position:absolute;left:-7vmin;top:-1vmin;width:14vmin;height:3vmin;border-radius:50%;background:rgba(245,145,60,.5);filter:blur(1.4vmin);${b.tween(1.2, 1.9, "transform:scale(.2);opacity:0", "transform:scale(1);opacity:1")}}
.name{position:absolute;left:0;right:0;top:${ctx.portrait ? 42 : 40}%;text-align:center}
.name .t{display:inline-block;overflow:hidden;font-weight:700;font-size:${ctx.portrait ? 17.5 : 18}vmin;line-height:1.05;letter-spacing:-.03em;color:var(--cream);padding:0 .1em}
.name .t span{display:inline-block}
.name .sub{margin-top:1vmin;font-size:4.6vmin;${b.win(3.6, 12.2)}}
.name .eyebrow{margin-top:5vmin;font-size:3.6vmin;${b.win(5.2, 12.2, { enter: "opacity:0;transform:translateY(1.6vmin)" })}}
${end.css}`;
      const body = `
<svg class="contours">${rings}</svg>
<div class="scene">
  <div class="pinwrap"><div class="rip"></div><div class="rip"></div><div class="rip"></div><div class="rip"></div><div class="shadow"></div>
    <div class="pin"><svg viewBox="0 0 18 24"><path d="M9 23s7.5-8.2 7.5-14A7.5 7.5 0 0 0 1.5 9c0 5.8 7.5 14 7.5 14z"/><circle cx="9" cy="9" r="2.8"/></svg></div>
  </div>
  <div class="name"><div class="t">${letters}</div><div class="sub">${area} · KwaZulu-Natal</div><div class="eyebrow">Opening soon</div></div>
</div>
${captions(b, [
  [1.2, 5.0, "Herbal Holland is coming to the Hills."],
  [5.5, 11.6, `Opening soon in ${name}. Join free and be first through the door.`],
])}
${end.html}`;
      return page(ctx, b, body, css);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// join: a phone mock of the join flow, three steps, with a 20-second ring.
const join: Scene = {
  name: "join",
  seconds: 24,
  html(ctx) {
    const b = new Build(ctx, 24);
    const end = endCard(b, 19.6);
    const steps = ["Your mobile number", "The one-time code", "Your card is ready"];
    const t1 = 2.0, t2 = 8.0, t3 = 14.0, tEnd = 19.4;
    const otp = "482 913".replace(" ", "");
    const css = `
.lay{position:absolute;inset:0;display:flex;flex-direction:${ctx.portrait ? "column" : "row"};align-items:center;justify-content:center;gap:${ctx.portrait ? 4 : 9}vmin;padding-bottom:${ctx.portrait ? 27 : 10}vh;padding-top:${ctx.portrait ? 3 : 0}vh;${b.win(0, tEnd + 0.4, { enter: "opacity:1", hold: "opacity:1", exit: "opacity:0", outS: 0.7 })}}
.side{display:flex;flex-direction:column;gap:2.6vmin;${ctx.portrait ? "align-items:center;text-align:center" : "min-width:52vmin"}}
.side .eyebrow{${b.win(0.4, tEnd)}}
.side .h1{font-size:${ctx.portrait ? 9 : 9.5}vmin;${b.win(0.6, tEnd, { enter: "opacity:0;transform:translateY(3vmin)" })}}
.steps{display:flex;flex-direction:${ctx.portrait ? "row" : "column"};gap:${ctx.portrait ? 1.6 : 1.8}vmin;margin-top:1vmin;${ctx.portrait ? "flex-wrap:wrap;justify-content:center" : ""}}
.step{display:flex;align-items:center;gap:1.8vmin;font-size:${ctx.portrait ? 3.1 : 4.2}vmin;font-weight:500;color:var(--ink450);border-radius:999px;padding:1.2vmin 2.4vmin 1.2vmin 1.2vmin;border:.35vmin solid var(--ink800)}
.step i{width:${ctx.portrait ? 5 : 6}vmin;height:${ctx.portrait ? 5 : 6}vmin;border-radius:50%;background:var(--ink800);color:var(--ink300);display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:700;font-size:${ctx.portrait ? 2.6 : 3.2}vmin}
${[t1, t2, t3].map((t, i) => `.step:nth-child(${i + 1}){${b.win(0.9 + i * 0.15, tEnd, { enter: "opacity:0;transform:translateY(1.5vmin)" })}}
.step:nth-child(${i + 1}) i{${b.tween(t, t + 0.5, "background:var(--ink800);color:var(--ink300)", "background:var(--orange);color:var(--black)")}}
.step:nth-child(${i + 1}){${b.tween(t, t + 0.5, "color:var(--ink450);border-color:var(--ink800)", "color:var(--cream);border-color:var(--ink600)")}}`).join("\n")}
.phonewrap{position:relative;${b.win(0.4, tEnd, { enter: "opacity:0;transform:translateY(5vmin) scale(.96)", inS: 1.1 })}}
.phone{position:relative;width:${ctx.portrait ? 42 : 37}vmin;height:${ctx.portrait ? 82 : 74}vmin;border-radius:${ctx.portrait ? 7 : 6}vmin;border:1vmin solid #3a322d;background:var(--ink900);box-shadow:0 4vmin 12vmin rgba(0,0,0,.7);overflow:hidden}
.notch{position:absolute;left:50%;top:1.6vmin;transform:translateX(-50%);width:34%;height:3.2vmin;border-radius:999px;background:var(--black)}
.scr{position:absolute;inset:0;padding:${ctx.portrait ? 12 : 10}vmin 4.4vmin ${ctx.portrait ? 5 : 4}vmin;display:flex;flex-direction:column;gap:2.2vmin;font-size:${ctx.portrait ? 3.4 : 3.1}vmin}
.scr .brand{display:flex;align-items:center;gap:1.4vmin;color:var(--orange);font-weight:700;font-size:${ctx.portrait ? 2.9 : 2.6}vmin;letter-spacing:.12em;text-transform:uppercase}
.scr .brand .mark{width:4.6vmin;height:4.6vmin}
.scr h2{margin:3vmin 0 0;font-size:${ctx.portrait ? 5.4 : 4.9}vmin;font-weight:700;line-height:1.05;letter-spacing:-.02em;color:var(--cream)}
.scr p{margin:0;color:var(--ink300);line-height:1.35}
.field{margin-top:1vmin;border-radius:2.4vmin;border:.4vmin solid var(--ink600);background:var(--black);padding:2.4vmin 3vmin;font-size:${ctx.portrait ? 5 : 4.4}vmin;font-weight:600;color:var(--cream);min-height:${ctx.portrait ? 10.6 : 9.6}vmin;display:flex;align-items:center;gap:1vmin}
.field .cur{display:inline-block;width:.35vmin;height:1em;background:var(--orange)}
.field .cc{color:var(--ink450);font-weight:500}
.btn{margin-top:auto;border-radius:999px;background:var(--orange);color:var(--black);font-weight:700;font-size:${ctx.portrait ? 4 : 3.6}vmin;padding:2.6vmin;text-align:center}
.s{position:absolute;inset:0}
.s1{${b.win(t1, t2, { enter: "opacity:0;transform:translateX(6vmin)", hold: "opacity:1;transform:none", exit: "opacity:0;transform:translateX(-6vmin)", outS: 0.5 })}}
.s2{${b.win(t2, t3, { enter: "opacity:0;transform:translateX(6vmin)", hold: "opacity:1;transform:none", exit: "opacity:0;transform:translateX(-6vmin)", outS: 0.5 })}}
.s3{${b.win(t3, tEnd, { enter: "opacity:0;transform:translateX(6vmin)", hold: "opacity:1;transform:none", exit: "opacity:0", outS: 0.5 })}}
.s0{${b.win(0, t1 + 0.3, { enter: "opacity:1", hold: "opacity:1", exit: "opacity:0", outS: 0.4 })};display:flex;align-items:center;justify-content:center}
.s0 .mark{width:16vmin;height:16vmin;color:var(--orange)}
${markDrawCss(b, ".s0", 0.4, 40)}
.s1 .btn{${b.tween(6.6, 7.0, "background:var(--orange);transform:none", "background:#ffb36a;transform:scale(.97)", EASE_IO)}}
.boxes{display:flex;gap:1.6vmin;margin-top:1vmin}
.box{flex:1;aspect-ratio:.86;border-radius:2vmin;border:.4vmin solid var(--ink600);background:var(--black);display:flex;align-items:center;justify-content:center;font-size:${ctx.portrait ? 5.6 : 4.8}vmin;font-weight:700;color:var(--cream)}
${otp.split("").map((_, i) => `.box:nth-child(${i + 1}){${b.tween(t2 + 1.6 + i * 0.32, t2 + 1.9 + i * 0.32, "border-color:var(--ink600)", "border-color:var(--orange)")}}
.box:nth-child(${i + 1}) span{${b.tween(t2 + 1.6 + i * 0.32, t2 + 1.9 + i * 0.32, "opacity:0;transform:translateY(1vmin)", "opacity:1;transform:none")}}`).join("\n")}
.sms{position:absolute;left:3vmin;right:3vmin;top:3vmin;border-radius:2.4vmin;background:#2a2420;padding:2vmin 2.6vmin;font-size:${ctx.portrait ? 2.9 : 2.6}vmin;color:var(--cream);box-shadow:0 2vmin 4vmin rgba(0,0,0,.5);${b.win(t2 + 0.5, t2 + 4.4, { enter: "opacity:0;transform:translateY(-6vmin)", exit: "opacity:0;transform:translateY(-6vmin)", ease: EASE_BOUNCE })}}
.sms b{display:block;color:var(--orange);font-size:.85em;letter-spacing:.14em;text-transform:uppercase;margin-bottom:.4vmin}
.s2 .btn{${b.tween(t2 + 4.2, t2 + 4.6, "background:var(--orange);transform:none", "background:#ffb36a;transform:scale(.97)", EASE_IO)}}
.mini{margin-top:2vmin;border-radius:2.6vmin;border:.4vmin solid var(--orange);background:linear-gradient(135deg,#1f1a16,#0c0a09);padding:2.6vmin;display:flex;flex-direction:column;gap:3.6vmin;${b.win(t3 + 0.5, tEnd, { enter: "opacity:0;transform:translateY(4vmin) rotate(-3deg)", hold: "opacity:1;transform:rotate(-2deg)", exit: "opacity:1;transform:rotate(-2deg)", inS: 1 })}}
.mini .top{display:flex;align-items:center;justify-content:space-between;font-size:${ctx.portrait ? 2.2 : 2}vmin;letter-spacing:.22em;text-transform:uppercase;color:var(--orange);font-weight:600}
.mini .mark{width:5vmin;height:5vmin;color:var(--orange)}
.mini .no{font-size:${ctx.portrait ? 9 : 8}vmin;font-weight:700;letter-spacing:-.03em;line-height:1}
.mini .no small{font-weight:300;color:var(--orange);font-size:.6em}
.mini .bt{font-size:${ctx.portrait ? 2.2 : 2}vmin;letter-spacing:.2em;text-transform:uppercase;color:var(--ink300)}
.conf{position:absolute;inset:0;pointer-events:none}
.conf i{position:absolute;width:1.6vmin;height:1.6vmin;border-radius:.3vmin;background:var(--orange)}
${Array.from({ length: 14 }, (_, i) => `.conf i:nth-child(${i + 1}){left:${(i * 37) % 100}%;background:${i % 3 ? "var(--orange)" : "var(--cream)"};${b.tween(t3 + 0.4 + (i % 5) * 0.12, t3 + 2.6 + (i % 4) * 0.3, `top:-4vmin;transform:rotate(0);opacity:1`, `top:110%;transform:rotate(${300 + i * 40}deg);opacity:0`, "cubic-bezier(.3,.6,.6,1)")}}`).join("\n")}
.timer{position:absolute;right:-2vmin;top:-2vmin;width:${ctx.portrait ? 16 : 14}vmin;height:${ctx.portrait ? 16 : 14}vmin}
.timer svg{width:100%;height:100%;transform:rotate(-90deg)}
.timer circle{fill:var(--black);stroke-width:5;stroke-linecap:round}
.timer .bg{stroke:var(--ink700)}
.timer .fg{stroke:var(--orange);stroke-dasharray:1 1;fill:none;${b.tween(t1, tEnd, "stroke-dashoffset:1", "stroke-dashoffset:0", "linear")}}
.timer .n{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:5vmin;font-weight:700;color:var(--cream)}
.timer .n small{font-size:.5em;font-weight:500;color:var(--ink300);margin-left:.2vmin}
.timerwrap{${b.win(t1 - 0.4, tEnd, { enter: "opacity:0;transform:scale(.6)", ease: EASE_BOUNCE })};position:absolute;inset:0;pointer-events:none}
${end.css}`;
    const body = `
<div class="lay">
  <div class="side"><div class="eyebrow">Herbal Holland Rewards</div><div class="h1">Join in<br><b>20 seconds.</b></div>
    <div class="steps">${steps.map((s, i) => `<div class="step"><i>${i + 1}</i>${s}</div>`).join("")}</div></div>
  <div class="phonewrap"><div class="phone"><div class="notch"></div>
    <div class="s s0">${mark()}</div>
    <div class="s s1"><div class="scr"><div class="brand">${mark()}Rewards</div><h2>Your mobile number</h2><p>We'll text you a one-time code. Adults 18+ only.</p><div class="field"><span class="cc">+27</span><span id="num"></span><span class="cur"></span></div><div class="btn">Send my code</div></div></div>
    <div class="s s2"><div class="scr"><div class="brand">${mark()}Rewards</div><h2>Enter the code</h2><p>Six digits, straight from the text we sent you.</p><div class="boxes">${otp.split("").map((d) => `<div class="box"><span>${d}</span></div>`).join("")}</div><div class="btn">Confirm</div></div>
      <div class="sms"><b>Herbal Holland</b>Your Rewards code is ${otp.slice(0, 3)} ${otp.slice(3)}. It expires in 10 minutes.</div></div>
    <div class="s s3"><div class="scr"><div class="brand">${mark()}Rewards</div><h2>You're in.</h2><p>Your card is ready and your welcome points are on it.</p>
      <div class="mini"><div class="top">${mark()}<span>Founding Member</span></div><div class="no"><small>#</small>0042</div><div class="bt">Herbal Holland Rewards</div></div>
      <div class="btn">Show my card</div></div><div class="conf">${"<i></i>".repeat(14)}</div></div>
    <div class="timerwrap"><div class="timer"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" pathLength="1"/></svg><div class="n"><span id="sec">0</span><small>s</small></div></div></div>
  </div></div>
</div>
${captions(b, [
  [0.8, 6.8, "Step 1: your mobile number. No forms, no passwords."],
  [8.3, 13.6, "Step 2: type the one-time code we text you."],
  [14.3, 19.3, "Step 3: your card is ready. That's it."],
])}
${end.html}`;
    const tick = `function(t){${TICK_HELPERS}
var digits="82 441 7390";var k=Math.round(digits.length*clamp(t,${t1 + 1.4},${t1 + 4.2}));txt("num",digits.slice(0,k));
var s=Math.min(20,Math.max(0,Math.floor((t-${t1})/(${tEnd}-${t1})*20)));txt("sec",String(s));}`;
    return page(ctx, b, body, css, tick);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// range: the category renders drift past as a grid. No prices, no close-ups.
const range: Scene = {
  name: "range",
  seconds: 20,
  html(ctx) {
    const b = new Build(ctx, 20);
    const end = endCard(b, 16);
    const imgs = CATEGORIES.map((c) => dataUri(new URL(`../../public/catalogue/categories/${c}.webp`, import.meta.url).pathname));
    const cols = ctx.portrait ? 2 : 4;
    const tileW = ctx.portrait ? 48 : 44; // vmin
    const tileH = tileW * (900 / 1440);
    const gap = 2.4;
    const perCol = Math.ceil(imgs.length / cols) + 1;
    const colHeight = perCol * (tileH + gap);
    const columns = Array.from({ length: cols }, (_, c) => {
      const list = Array.from({ length: perCol }, (_, i) => imgs[(c * perCol + i) % imgs.length]);
      const doubled = [...list, ...list];
      const up = c % 2 === 0;
      const dist = colHeight;
      const style = b.tween(0, 20, `transform:translateY(${up ? 0 : -dist}vmin)`, `transform:translateY(${up ? -dist : 0}vmin)`, "linear");
      return `<div class="col" style="${style}">${doubled.map((src) => `<div class="tile"><img src="${src}"></div>`).join("")}</div>`;
    }).join("");
    const labels = ["Flower", "Pre-rolls", "Edibles", "Vapes", "Wellness", "Skin care", "Coffee", "Nutrition", "Accessories", "Apparel", "Grow"];
    const css = `
.grid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-6deg);display:flex;gap:${gap}vmin;${b.win(0, 16.4, { enter: "opacity:0;transform:translate(-50%,-50%) rotate(-6deg) scale(1.08)", hold: "opacity:1;transform:translate(-50%,-50%) rotate(-6deg) scale(1)", exit: "opacity:0;transform:translate(-50%,-50%) rotate(-6deg) scale(1.04)", inS: 2.2, outS: 0.8, ease: EASE_IO })}}
.col{display:flex;flex-direction:column;gap:${gap}vmin;will-change:transform}
.tile{width:${tileW}vmin;height:${tileH}vmin;border-radius:3vmin;overflow:hidden;background:#efe6da;box-shadow:0 2vmin 6vmin rgba(0,0,0,.5)}
.tile img{width:100%;height:100%;object-fit:cover;display:block}
.veil{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(12,10,9,.5) 0%,rgba(12,10,9,.3) 45%,rgba(12,10,9,.82) 100%)}
.veil2{position:absolute;inset:0;background:linear-gradient(rgba(12,10,9,.9),rgba(12,10,9,0) 30%,rgba(12,10,9,0) 65%,rgba(12,10,9,.95))}
.title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 6vmin}
.title .eyebrow{${b.win(1.2, 15.8)}}
.title .h1{margin-top:2.4vmin;font-size:${ctx.portrait ? 15 : 14}vmin;text-shadow:0 1vmin 4vmin rgba(0,0,0,.7);${b.win(1.5, 15.8, { enter: "opacity:0;transform:translateY(4vmin)", inS: 1.2 })}}
.tick{position:absolute;left:0;right:0;top:${ctx.portrait ? 61 : 65}%;overflow:hidden;white-space:nowrap;${b.win(3.2, 15.8, { enter: "opacity:0", hold: "opacity:1", exit: "opacity:0" })}}
.tick .in{display:inline-block;font-size:4.6vmin;font-weight:500;color:var(--cream);letter-spacing:.02em;${b.tween(0, 20, "transform:translateX(0)", "transform:translateX(-50%)", "linear")}}
.tick .in i{display:inline-block;width:1.2vmin;height:1.2vmin;border-radius:50%;background:var(--orange);margin:0 2.8vmin;vertical-align:middle}
${end.css}`;
    const run = labels.map((l) => `${l}<i></i>`).join("");
    const body = `
<div class="grid">${columns}</div><div class="veil"></div><div class="veil2"></div>
<div class="title"><div class="eyebrow">Herbal Holland</div><div class="h1">The <b>range.</b></div></div>
<div class="tick"><div class="in">${run}${run}</div></div>
${captions(b, [
  [2.0, 7.4, "Thirteen ranges, one standard: lab-tested, adults only."],
  [8.0, 15.6, "From the Windmill to the Hills. In store and online, soon."],
])}
${end.html}`;
    return page(ctx, b, body, css);
  },
};

export const SCENES: Scene[] = [welcome, founding, labTested, rewards, town("Hillcrest", "Upper Highway"), town("Hilton", "The Midlands"), join, range];
