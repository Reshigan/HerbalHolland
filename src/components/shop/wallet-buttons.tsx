// "Add to Apple Wallet" / "Add to Google Wallet" under the Rewards card — only once the wallets are set up
// (WALLET_* environment, see docs/INTEGRATIONS.md). Plain links: the routes build and sign the passes.
import { Smartphone } from "lucide-react";
import { walletAvailable } from "@/server/shop/wallet";
import { cn } from "@/lib/cn";

export function WalletButtons({ className }: { className?: string }) {
  const w = walletAvailable();
  if (!w.apple && !w.google) return null;
  return (
    <div className={cn("flex flex-wrap justify-center gap-2", className)}>
      {w.apple && (
        <a href="/club/wallet/apple.pkpass" className="inline-flex h-11 items-center gap-2 rounded-full bg-black px-4 text-sm font-semibold text-white ring-1 ring-ink-600 hover:ring-ink-400" download="herbal-holland-rewards.pkpass">
          <Smartphone className="h-4 w-4" /> Add to Apple Wallet
        </a>
      )}
      {w.google && (
        <a href="/club/wallet/google" className="inline-flex h-11 items-center gap-2 rounded-full bg-black px-4 text-sm font-semibold text-white ring-1 ring-ink-600 hover:ring-ink-400" rel="noopener">
          <Smartphone className="h-4 w-4" /> Add to Google Wallet
        </a>
      )}
    </div>
  );
}
