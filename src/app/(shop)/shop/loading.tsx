import { Bone, ProductGridSkeleton } from "@/components/shop/skeleton";
import { Container } from "@/components/shop/ui";

export default function Loading() {
  return (
    <Container className="pt-8" role="status" aria-live="polite" aria-label="Loading">
      <Bone className="h-3 w-24" />
      <Bone className="mt-3 h-9 w-56" />
      <div className="mt-6 flex gap-2">
        {["w-20", "w-24", "w-16", "w-28"].map((w) => (
          <Bone key={w} className={`h-9 rounded-full ${w}`} />
        ))}
      </div>
      <ProductGridSkeleton className="mt-8" />
    </Container>
  );
}
