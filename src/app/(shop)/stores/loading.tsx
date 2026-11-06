import { Bone, ProductGridSkeleton } from "@/components/shop/skeleton";
import { Container } from "@/components/shop/ui";

export default function Loading() {
  return (
    <Container className="pt-10 sm:pt-14" role="status" aria-live="polite" aria-label="Loading">
      <Bone className="h-3 w-24" />
      <Bone className="mt-3 h-10 w-72 max-w-full" />
      <ProductGridSkeleton className="mt-8" />
    </Container>
  );
}
