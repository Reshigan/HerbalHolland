import { cn } from "@/lib/cn";
import { articleImage, type ArticleMeta } from "./articles";

/** An article's studio render, cropped to fill its frame, with a slow zoom when its card (a `group`) is hovered. */
export function ArticlePicture({ a, className, eager }: { a: Pick<ArticleMeta, "image">; className?: string; eager?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden bg-ink-850", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={articleImage(a)}
        alt=""
        width={900}
        height={900}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/40 to-transparent" />
    </div>
  );
}
