"use client";
// "Your join QR" on the Shift view: the signed-in person's own join link for friends and walk-ins to scan, and how
// many members joined with them this month. Hidden offline.
import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { api } from "./lib/api";
import { usePos } from "./context";

type Mine = { url: string; joins: number; svg: string };

export function InviteTile() {
  const { me, online } = usePos();
  const [mine, setMine] = useState<{ userId: string; data: Mine } | null>(null);

  useEffect(() => {
    if (!online) return;
    let live = true;
    api<Mine>("/api/pos/invite", { quiet401: true, timeoutMs: 10_000 })
      .then((data) => live && setMine({ userId: me.id, data }))
      .catch(() => live && setMine(null));
    return () => {
      live = false;
    };
  }, [me.id, online]);

  if (!online || !mine || mine.userId !== me.id) return null;
  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800" aria-label="Your join QR" data-testid="my-invite">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-500/15 text-brand-400">
          <UserPlus className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-sm text-ink-400">Joined with you this month</div>
          <div className="font-display text-2xl font-semibold text-white tnum">{mine.data.joins}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4">
        {/* Our own server's QR (qrcode's SVG), not user content. */}
        <div className="w-32 shrink-0 overflow-hidden rounded-xl [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label="Your join QR code" dangerouslySetInnerHTML={{ __html: mine.data.svg }} />
        <p className="text-sm text-ink-300">Your own join link: let a customer scan it to join on their phone, or share it with friends (adults 18+). Every member who joins with it counts for you.</p>
      </div>
    </section>
  );
}
