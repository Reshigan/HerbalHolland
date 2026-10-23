import { Bone } from "@/components/shop/skeleton";
import { Container } from "@/components/shop/ui";

export default function Loading() {
  return (
    <Container className="pt-8" role="status" aria-live="polite" aria-label="Loading your card">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12">
        <div className="space-y-4">
          <Bone className="aspect-[1.6/1] rounded-[1.6rem]" />
          <Bone className="mx-auto h-3 w-2/3" />
          <div className="flex gap-2">
            <Bone className="h-12 flex-1 rounded-full" />
            <Bone className="h-12 flex-1 rounded-full" />
          </div>
        </div>
        <div className="space-y-4">
          <Bone className="h-3 w-32" />
          <Bone className="h-10 w-48" />
          <Bone className="h-4 w-full max-w-md" />
          <Bone className="h-4 w-3/4 max-w-sm" />
          <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3">
            <Bone className="h-24" />
            <Bone className="h-24" />
            <Bone className="h-24" />
          </div>
        </div>
      </div>
    </Container>
  );
}
