import { Bone } from "@/components/shop/skeleton";
import { Container } from "@/components/shop/ui";

export default function Loading() {
  return (
    <Container className="pt-8" role="status" aria-live="polite" aria-label="Loading your bag">
      <Bone className="h-9 w-40" />
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4 rounded-2xl border border-ink-800 p-4">
              <Bone className="h-20 w-20 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-2/3" />
                <Bone className="h-3 w-1/3" />
                <Bone className="h-10 w-28 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-2xl border border-ink-800 p-5">
          <Bone className="h-4 w-1/2" />
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-2/3" />
          <Bone className="mt-4 h-14 w-full rounded-full" />
        </div>
      </div>
    </Container>
  );
}
