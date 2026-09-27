// Card-present payments ("tap on glass"). One interface, three providers:
//   SIMULATED     — demo flow that approves (or declines on request) after a short tap animation
//   HALO_APPLINK  — Halo Dot Halo.Link: the server creates a session (payments.createHaloSession)
//                   and the till hands over to the Halo app via the returned app link
//   EXTERNAL      — a separate bank terminal; the cashier keys in its auth code (see payment sheet)
import { api } from "./api";
import type { TapProviderKind } from "@/server/pos/types";

export type CardOutcome =
  | { status: "APPROVED"; provider: string; reference: string; cardBrand?: string; cardLast4?: string }
  | { status: "DECLINED" | "NETWORK_ERROR" | "CANCELLED"; provider: string; message: string };

const BRANDS = [
  ["Visa", "4242"],
  ["Mastercard", "5454"],
  ["Visa", "1881"],
  ["Mastercard", "0005"],
  ["Amex", "8431"],
] as const;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("Cancelled", "AbortError"))), { once: true });
  });

export async function startCardPayment(opts: {
  provider: TapProviderKind; // from the bootstrap (NEXT_PUBLIC_TAP_PROVIDER, SIMULATED by default)
  amountCents: number;
  reference: string;
  signal: AbortSignal;
  simulate?: "approve" | "decline";
}): Promise<CardOutcome> {
  const provider = opts.provider;
  try {
    if (provider === "HALO_APPLINK") {
      const session = await api<{ url: string; transactionId?: string }>("/api/pos/card", { body: { amountCents: opts.amountCents, reference: opts.reference } });
      // Hand over to the Halo.Link app; its result returns to the till via the app-link callback.
      window.location.assign(session.url);
      await wait(120_000, opts.signal);
      return { status: "NETWORK_ERROR", provider: "HALO", message: "No response from the Halo app" };
    }
    // SIMULATED: the customer taps, the "acquirer" answers.
    await wait(2200, opts.signal);
    if (opts.simulate === "decline") return { status: "DECLINED", provider: "SIMULATED", message: "Declined by the card issuer — try another card" };
    const [brand, last4] = BRANDS[Math.floor(Math.random() * BRANDS.length)];
    return { status: "APPROVED", provider: "SIMULATED", reference: String(Math.floor(100000 + Math.random() * 900000)), cardBrand: brand, cardLast4: last4 };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { status: "CANCELLED", provider, message: "Cancelled" };
    return { status: "NETWORK_ERROR", provider, message: (e as Error).message };
  }
}
