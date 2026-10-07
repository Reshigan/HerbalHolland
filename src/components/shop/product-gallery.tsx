// The product page's pictures: real photos when the catalogue has them (a swipeable strip with thumbnails, no
// script; scroll-snap and anchors do the work), else the generated art. Sized boxes throughout, so nothing shifts
// while a photo loads.
import { productImageUrl, type ProductPhoto } from "@/server/shop/images";
import { cn } from "@/lib/cn";

export function ProductGallery({ photos, art, name, badges, className }: { photos: ProductPhoto[]; art: React.ReactNode; name: string; badges?: React.ReactNode; className?: string }) {
  if (!photos.length)
    return (
      <div className={cn("hh-beads-foot relative overflow-hidden rounded-[2rem] border border-ink-800 bg-ink-900", className)}>
        {art}
        {badges && <div className="absolute left-4 top-4 flex flex-wrap gap-2">{badges}</div>}
      </div>
    );
  return (
    <div className={className}>
      <div className="hh-beads-foot relative overflow-hidden rounded-[2rem] border border-ink-800 bg-ink-900">
        <ul className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto [scroll-behavior:smooth]" aria-label={`${name}: photos`}>
          {photos.map((p, i) => (
            <li key={p.id} id={`photo-${i + 1}`} className="relative aspect-square w-full shrink-0 snap-center scroll-mt-28">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={productImageUrl(p.id)}
                alt={p.alt || `${name}, photo ${i + 1} of ${photos.length}`}
                width={1200}
                height={1200}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : undefined}
                decoding="async"
                className="h-full w-full object-cover"
              />
            </li>
          ))}
        </ul>
        {badges && <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">{badges}</div>}
      </div>
      {photos.length > 1 && (
        <ol className="scrollbar-none mt-3 flex gap-2 overflow-x-auto" aria-label="Choose a photo">
          {photos.map((p, i) => (
            <li key={p.id} className="shrink-0">
              <a href={`#photo-${i + 1}`} aria-label={`Photo ${i + 1}`} className="block h-16 w-16 overflow-hidden rounded-xl ring-1 ring-ink-700 transition hover:ring-brand-500 focus-visible:ring-brand-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={productImageUrl(p.id)} alt="" width={128} height={128} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
