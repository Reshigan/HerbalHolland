// The windmill Mark as an SVG string (same geometry as @/components/brand/logo) for
// generated images — app icons, PWA icons and Open Graph cards — where React
// components can't be used directly.
import { PETAL } from "@/components/brand/logo";

export function markSvg({ fg = "#f5913c", bg = "#0c0a09", size = 512, inset = 0.14, radius = 0.22 }: { fg?: string; bg?: string | null; size?: number; inset?: number; radius?: number } = {}) {
  const s = 1 - inset * 2;
  const petals = [45, 135, 225, 315].map((r) => `<path d="${PETAL}" transform="rotate(${r - 90})" stroke-width="3.6"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${
    bg ? `<rect width="100" height="100" rx="${radius * 100}" fill="${bg}"/>` : ""
  }<g transform="translate(${inset * 100} ${inset * 100}) scale(${s})" fill="none" stroke="${fg}" stroke-linecap="round" stroke-linejoin="round"><path d="M 36.2 82.6 A 40 40 0 1 1 63.8 82.6" stroke-width="5.5"/><path d="M 33 91 L 50 44.5 L 67 91" stroke-width="5.5"/><path d="M 42.5 91 L 50 69 L 57.5 91" stroke-width="3.2"/><g transform="translate(50 40)">${petals}<circle r="3.4" stroke-width="2.4"/><circle r="0.9" fill="${fg}" stroke="none"/></g></g></svg>`;
}

export const markDataUri = (opts?: Parameters<typeof markSvg>[0]) => `data:image/svg+xml;base64,${Buffer.from(markSvg(opts)).toString("base64")}`;
