// "Save to Google Wallet": redirects to Google's save page with the member's pass inside a signed JWT. Needs
// WALLET_GOOGLE_ISSUER_ID and WALLET_GOOGLE_SERVICE_ACCOUNT_JSON (see docs/INTEGRATIONS.md).
import { NextResponse } from "next/server";
import { getCustomer } from "@/server/auth";
import { googleSaveLink, passMember, walletAvailable, WalletError } from "@/server/shop/wallet";

export async function GET() {
  const customer = await getCustomer();
  if (!customer) return NextResponse.redirect(new URL("/club/join?next=/club", process.env.APP_URL ?? "http://localhost:3000"));
  if (!walletAvailable().google) return NextResponse.json({ error: "Google Wallet isn't set up yet: set WALLET_GOOGLE_ISSUER_ID and WALLET_GOOGLE_SERVICE_ACCOUNT_JSON." }, { status: 404 });
  try {
    return NextResponse.redirect(googleSaveLink(passMember(customer)), { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof WalletError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
