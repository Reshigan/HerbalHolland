// Home-screen icons for the installable apps: the same Mark in a different pairing of the brand colours, so a phone
// that carries more than one Herbal Holland app tells them apart at a glance. Rendered as PNG (Android launchers and
// iOS need bitmaps; some launchers ignore SVG-only manifests).
import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/shop/mark-svg";

export const APP_ICONS = {
  rewards: { fg: "#f5913c", bg: "#0c0a09" }, // Holland orange on warm black (brand-500 on ink-950)
  till: { fg: "#0c0a09", bg: "#f5913c" }, // warm black on orange
  office: { fg: "#0c0a09", bg: "#fbf7f3" }, // warm black on cream (ink-50), like the back office itself
} as const;
export type AppIcon = keyof typeof APP_ICONS;

/** A square PNG of `px` pixels with the Mark inset by `inset` of the width on each side (maskable icons need ≥ 0.2). */
export function appIcon(app: AppIcon, px: number, inset: number, headers?: Record<string, string>) {
  const c = APP_ICONS[app];
  const mark = Math.round(px * (1 - inset * 2));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri({ fg: c.fg, bg: null, size: mark, inset: 0 })} width={mark} height={mark} alt="" />
      </div>
    ),
    { width: px, height: px, headers },
  );
}
