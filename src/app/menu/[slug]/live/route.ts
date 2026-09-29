// Live stock and prices for the menu board (polled every 60 s by the board's client script). Public catalogue only:
// licensed medicines are never on the board in MEDICAL mode, so they're never in this feed either.
import { boardLive, boardStore } from "@/server/menu-board";
import { getClasses } from "@/server/shop/access";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await boardStore(slug);
  if (!store) return new Response("Not found", { status: 404 });
  const classes = await getClasses();
  const live = await boardLive(store.id, { includeLicensed: classes.thcMode === "ADULT_USE" });
  return Response.json(live, { headers: { "Cache-Control": "no-store" } });
}
