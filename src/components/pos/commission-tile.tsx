"use client";
// "Your commission this month" for whoever is signed in, on the Shift view (away from the customer-facing sell screen).
// Hidden when the store doesn't pay commission or the till is offline. It never says why a line is held:
// nobody sees the loss-prevention alerts about themselves.
import { useEffect, useState } from "react";
import { HandCoins } from "lucide-react";
import { zar } from "@/lib/money";
import { api } from "./lib/api";
import { usePos } from "./context";

type Mine = { month: string; commissionCents: number; held: boolean };

export function CommissionTile() {
  const { me, online } = usePos();
  const [mine, setMine] = useState<{ userId: string; data: Mine } | null>(null);

  useEffect(() => {
    if (!online) return;
    let live = true;
    // A store without commission answers null, which api() rejects as an empty answer: either way the tile stays hidden.
    api<Mine | null>("/api/pos/commission", { quiet401: true, timeoutMs: 10_000 })
      .then((data) => live && setMine(data ? { userId: me.id, data } : null))
      .catch(() => live && setMine(null));
    return () => {
      live = false;
    };
  }, [me.id, online]);

  if (!online || !mine || mine.userId !== me.id) return null;
  return (
    <section className="flex items-center gap-3 rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800" aria-label="Your commission this month" data-testid="my-commission">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-500/15 text-brand-400">
        <HandCoins className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-sm text-ink-400">Your commission this month</div>
        {mine.data.held ? (
          <div className="font-display text-lg font-semibold text-[#f3c65a]">Held — see your manager</div>
        ) : (
          <div className="font-display text-2xl font-semibold text-white tnum">{zar(mine.data.commissionCents)}</div>
        )}
      </div>
    </section>
  );
}
