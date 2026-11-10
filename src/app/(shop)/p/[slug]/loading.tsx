import { Bone } from "@/components/shop/skeleton";
import { Container } from "@/components/shop/ui";

export default function Loading() {
  return (
    <Container className="pt-8" role="status" aria-live="polite" aria-label="Loading product">
      <Bone className="h-3 w-40" />
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Bone className="aspect-square rounded-3xl" />
        <div className="space-y-4">
          <Bone className="h-3 w-24" />
          <Bone className="h-10 w-3/4" />
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-5/6" />
          <Bone className="h-8 w-28" />
          <div className="flex gap-2 pt-2">
            <Bone className="h-11 w-24 rounded-full" />
            <Bone className="h-11 w-24 rounded-full" />
          </div>
          <Bone className="h-14 w-full rounded-full" />
        </div>
      </div>
    </Container>
  );
}
