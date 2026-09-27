// Initial-load placeholder for a report (filter changes keep the previous render instead).
export function ReportSkeleton() {
  const bar = "animate-pulse rounded-xl bg-ink-150/70";
  return (
    <div aria-busy="true" aria-label="Loading report">
      <div className="mb-6 space-y-3">
        <div className={`${bar} h-3 w-32`} />
        <div className={`${bar} h-8 w-72`} />
        <div className={`${bar} h-4 w-96 max-w-full`} />
      </div>
      <div className={`${bar} mb-6 h-10 w-full max-w-2xl rounded-full`} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[6.5rem] animate-pulse rounded-2xl border border-ink-150 bg-white" />
        ))}
      </div>
      <div className="mb-6 h-72 animate-pulse rounded-2xl border border-ink-150 bg-white" />
      <div className="h-96 animate-pulse rounded-2xl border border-ink-150 bg-white" />
    </div>
  );
}
