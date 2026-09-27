// "Add to calendar": the event as a single-event .ics file (public details only — no ticket code).
import { db } from "@/server/db";
import { APP_URL } from "@/server/invoices";
import { icsEvent } from "@/server/shop/launch-rules";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await db.storeEvent.findUnique({ where: { slug }, include: { store: { select: { name: true, addressLine: true, suburb: true, city: true } } } });
  if (!e) return new Response("Not found", { status: 404 });
  const url = `${APP_URL()}/events/${e.slug}`;
  const host = new URL(APP_URL()).hostname;
  const body = icsEvent({
    uid: `${e.id}@${host}`,
    title: `${e.title} · Herbal Holland`,
    description: `${e.blurb}\n\nAdults 18+ — bring your ID and your ticket (in Herbal Holland Rewards).\n${url}`,
    location: `Herbal Holland ${e.store.name}, ${e.store.addressLine}, ${e.store.suburb}, ${e.store.city}`,
    url,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="herbal-holland-${e.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
