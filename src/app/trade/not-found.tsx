import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function TradeNotFound() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-ink-800 bg-ink-900/60 p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/15 text-brand-400">
        <SearchX className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="font-display text-xl font-semibold text-white">Not found</h1>
      <p className="mt-2 text-sm text-ink-300">That page or order doesn&apos;t exist, or belongs to another account.</p>
      <div className="mt-6 flex justify-center">
        <ButtonLink href="/trade" variant="outline-dark">
          Trade home
        </ButtonLink>
      </div>
    </div>
  );
}
