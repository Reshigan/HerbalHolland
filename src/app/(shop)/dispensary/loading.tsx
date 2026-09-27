import { Mark } from "@/components/brand/logo";

export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 text-brand-500">
        <Mark spin="fast" className="h-16 w-16" />
        <span className="eyebrow text-ink-400">Loading</span>
      </div>
    </div>
  );
}
