"use client";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

/** Store filter: the phone's own picker, because a network can run to hundreds of stores. */
export function StorePicker({ stores, value, hrefs }: { stores: { code: string; name: string }[]; value: string; hrefs: Record<string, string> }) {
  const router = useRouter();
  return (
    <label className="relative inline-flex h-10 max-w-full items-center">
      <span className="sr-only">Store</span>
      <select value={value} onChange={(e) => router.push(hrefs[e.target.value])} className="h-10 max-w-full appearance-none truncate rounded-full border border-ink-150 bg-white pr-9 pl-4 text-sm font-semibold text-ink-850">
        <option value="">All stores</option>
        {stores.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-ink-500" aria-hidden />
    </label>
  );
}
