// A Studio post's card as an image, for HQ: PNG to preview, JPEG with ?download (what a phone saves and Instagram takes).
// ?size=square|portrait|story|link (src/server/studio-cards.tsx).
import { getStaff, HQ_ROLES } from "@/server/auth";
import { db } from "@/server/db";
import { cardJpeg, isCardSize, renderCard, type CardSize } from "@/server/studio-cards";
import type { Card } from "@/lib/studio";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getStaff();
  if (!user || !HQ_ROLES.includes(user.role)) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const it = await db.studioItem.findUnique({ where: { id }, select: { key: true, card: true } });
  if (!it?.card) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const raw = q.get("size");
  const size: CardSize = isCardSize(raw) ? raw : "square";
  const card = it.card as Card;
  if (q.has("download"))
    return new Response(new Uint8Array(await cardJpeg(card, size)), {
      headers: { "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="herbal-holland-${it.key}-${size}.jpg"`, "Cache-Control": "private, no-store" },
    });
  const png = await renderCard(card, size);
  return new Response(png.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
}
