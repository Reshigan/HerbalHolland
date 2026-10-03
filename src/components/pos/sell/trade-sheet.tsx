"use client";
// Trade-sale mode: find the trade account buying — by trading or legal name, number (TA-…, however typed) or VAT
// number — and put the basket into trade mode: WHOLESALE prices ex VAT with VAT per line, the account's buyer block on
// the tax invoice, "On account" within its credit terms. Needs the connection: accounts, prices and the credit
// decision live on the server, and a trade sale is never queued.
import { useEffect, useRef, useState } from "react";
import { Building2, Search } from "lucide-react";
import { zar } from "@/lib/money";
import { api, errorText } from "../lib/api";
import { tradeTermsLabel } from "../lib/rules";
import { Alert, Chip, Sheet, Spinner, TextInput } from "../ui";
import type { TradeAccountDTO } from "@/server/pos/types";

export function TradeSheet({ open, online, onClose, onPick }: { open: boolean; online: boolean; onClose: () => void; onPick: (a: TradeAccountDTO) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TradeAccountDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!open || !online || term.length < 2) {
      setHits(null);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ accounts: TradeAccountDTO[] }>("/api/pos/trade/accounts", { body: { q: term } });
        if (n !== seq.current) return;
        setHits(r.accounts);
        setError(null);
      } catch (e) {
        if (n === seq.current) setError(errorText(e));
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, open, online]);

  return (
    <Sheet open={open} onClose={onClose} title="Trade sale" subtitle="Find the business's trade account — name, number (TA-…) or VAT number" size="lg">
      {!online ? (
        <Alert tone="warn">Trade sales need a connection: the account, its trade prices and its credit terms live on the server. Try again when the till is back online.</Alert>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
            <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Green Leaf Pharmacy · TA-000123 · 4123456789" aria-label="Search trade accounts" className="h-14 pl-12 text-lg" data-testid="trade-search" />
            {loading && <Spinner className="absolute right-4 top-1/2 -translate-y-1/2" />}
          </div>
          {error && <Alert className="mt-3">{error}</Alert>}
          <ul className="mt-4 space-y-2" aria-label="Trade accounts found">
            {hits?.map((a) => {
              const onHold = a.status === "ON_HOLD";
              const credit = a.terms === "ACCOUNT" && !onHold;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onPick(a)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-ink-850 px-4 py-3 text-left ring-1 ring-ink-800 transition hover:ring-sky-500/60"
                    data-testid={`trade-account-${a.number}`}
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky-500/20 text-[#8fbdf2]">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-white">{a.name}</span>
                        <Chip tone={onHold ? "amber" : "green"}>{onHold ? "On hold" : "Approved"}</Chip>
                        <Chip tone="blue">{tradeTermsLabel(a)}</Chip>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-400">
                        {a.number}
                        {a.legalName !== a.name ? ` · ${a.legalName}` : ""}
                        {a.vatNumber ? ` · VAT ${a.vatNumber}` : ""}
                      </span>
                      <span className="block text-xs text-ink-400">
                        {credit ? `${zar(a.availableCents)} available on account · owing ${zar(a.balanceCents)}` : onHold ? "On hold — cash, card or EFT only" : "Prepaid — cash, card or EFT"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-[#8fbdf2]">Trade sale</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {hits && hits.length === 0 && !loading && <p className="mt-6 text-center text-sm text-ink-400">No approved trade account matches “{q.trim()}”. New accounts apply at herbalholland.co.za/trade and are approved by HQ.</p>}
          <p className="mt-6 text-xs leading-relaxed text-ink-400">
            A trade sale is for the business: no member, points, member prices or deals. Prices are the account&apos;s trade prices ex VAT with VAT per line, and the tax invoice goes to its billing email. Age-restricted items still need the usual ID check at the counter.
          </p>
        </>
      )}
    </Sheet>
  );
}
