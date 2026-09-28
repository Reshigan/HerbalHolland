import { Mark } from "@/components/brand/logo";

export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 text-brand-500">
        <Mark spin="fast" className="h-14 w-14" />
        <span className="eyebrow text-ink-400">Loading your card</span>
      </div>
    </div>
  );
}
