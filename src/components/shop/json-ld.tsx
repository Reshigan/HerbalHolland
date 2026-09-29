import { serializeJsonLd } from "@/lib/seo";

/** Structured data for search engines: one script per page, built by the pure helpers in @/lib/seo. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
