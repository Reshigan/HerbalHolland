// The member's Rewards card as an Apple Wallet pass (.pkpass). Needs WALLET_APPLE_* (see docs/INTEGRATIONS.md);
// until then it says so plainly. Signed on the fly in memory (PKCS#7 with WebCrypto, @/lib/pkcs7). Nothing is stored.
import { NextResponse } from "next/server";
import { getCustomer } from "@/server/auth";
import { buildApplePass, passMember, walletAvailable, WalletError } from "@/server/shop/wallet";

export async function GET() {
  const customer = await getCustomer();
  if (!customer) return NextResponse.redirect(new URL("/club/join?next=/club", process.env.APP_URL ?? "http://localhost:3000"));
  if (!walletAvailable().apple) return NextResponse.json({ error: "Apple Wallet isn't set up yet: set WALLET_APPLE_PASS_TYPE_ID, WALLET_APPLE_TEAM_ID, WALLET_APPLE_CERT_PEM, WALLET_APPLE_KEY_PEM and WALLET_APPLE_WWDR_PEM." }, { status: 404 });
  try {
    const bytes = await buildApplePass(passMember(customer));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/vnd.apple.pkpass",
        "content-disposition": 'attachment; filename="herbal-holland-rewards.pkpass"',
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof WalletError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
