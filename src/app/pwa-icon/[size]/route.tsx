// PNG icons for the installable apps (Android needs 192 and 512; "maskable" keeps the Mark inside the safe zone when
// the launcher crops it to a circle). /pwa-icon/192 is the Rewards app; /pwa-icon/till-512 and /pwa-icon/office-512
// are the till and the back office (see @/components/brand/app-icon for the colour pairings).
import { appIcon, APP_ICONS, type AppIcon } from "@/components/brand/app-icon";

const SIZES: Record<string, { px: number; inset: number }> = {
  "192": { px: 192, inset: 0.12 },
  "512": { px: 512, inset: 0.12 },
  maskable: { px: 512, inset: 0.22 },
};

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const m = /^(?:(till|office)-)?(192|512|maskable)$/.exec((await params).size);
  const s = m && SIZES[m[2]];
  if (!m || !s) return new Response("Not found", { status: 404 });
  const app = (m[1] ?? "rewards") as AppIcon;
  if (!(app in APP_ICONS)) return new Response("Not found", { status: 404 });
  return appIcon(app, s.px, s.inset, { "Cache-Control": "public, max-age=604800, immutable" });
}
