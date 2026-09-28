// The share card (og.png, 1200 × 630) and the home-screen icon, drawn with the site's own art and styles. build.ts
// --images renders them to PNG with Chromium, as scripts/merch-export.tsx does for the merch files.
import { BRAND } from "../content";
import { AgeBadge, Mark, Scene, Sprite, Wordmark, type SceneSpec } from "./art";

const OG_SCENE: SceneSpec = { sun: { x: 1175, y: 560, r: 250 }, mill: true, hills: ["hl1", "hl2", "hl3", "hl4"] };

export function OgCard() {
  return (
    <>
      <Sprite />
      <div className="og">
        <div className="og__frame">
          <Scene kind="og" spec={OG_SCENE} />
          <div className="og__text">
            <Wordmark className="og__wm" />
            <p className="og__line">
              {BRAND.lines[0]} <b>{BRAND.lines[1]}</b>
            </p>
            <p className="og__idea">{BRAND.idea}</p>
            <p className="og__age">
              <AgeBadge /> {BRAND.og.age}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export function AppIcon({ size }: { size: number }) {
  return (
    <>
      <Sprite />
      <div className={`appicon appicon--${size}`}>
        <Mark className="appicon__mark" />
      </div>
    </>
  );
}

/** Styles only the renderer uses (the page's own stylesheet supplies the rest). */
export const OG_CSS = `
html,body{margin:0;background:var(--ink-950)}body::after{display:none}
.og{width:1200px;height:630px;padding:22px;background:var(--ink-950)}
.og__frame{position:relative;height:100%;border:16px solid var(--brand-500);border-radius:40px;overflow:hidden;background:radial-gradient(70% 80% at 76% 62%,color-mix(in oklab,var(--brand-800) 45%,var(--ink-950)),var(--ink-950) 72%)}
.og .sc{position:absolute;inset:0;overflow:hidden}.sc__l{position:absolute;inset:0;width:100%;height:100%}.og .mill{color:var(--ink-950);stroke:var(--ink-950)}
.og__text{position:absolute;left:64px;top:62px;display:grid;gap:22px;justify-items:start}
.og__wm{font-size:58px;color:var(--brand-500)}
.og__line{margin-top:18px;font:300 46px/1.08 var(--display);letter-spacing:-.02em;color:var(--ink-200)}
.og__line b{display:block;font-weight:600;color:var(--ink-50)}
.og__idea{font:500 22px/1 var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--brand-400)}
.og__age{display:flex;align-items:center;gap:14px;margin-top:6px;font:500 20px var(--display);color:var(--ink-300)}
.og__age .age{width:48px;height:48px;font-size:14px;border-width:3px}
.appicon{display:grid;place-items:center;background:var(--ink-950)}
.appicon--180{width:180px;height:180px}.appicon--180 .appicon__mark{width:136px;height:136px}
.appicon--32{width:32px;height:32px;border-radius:7px}.appicon--32 .appicon__mark{width:28px;height:28px}
.appicon__mark{color:var(--brand-500)}
.appicon--32 .appicon__mark path,.appicon--32 .appicon__mark use{stroke-width:7}
`;
