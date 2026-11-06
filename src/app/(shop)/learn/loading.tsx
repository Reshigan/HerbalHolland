import { Bone } from "@/components/shop/skeleton";
import { Container } from "@/components/shop/ui";

export default function Loading() {
  return (
    <Container className="pt-10 sm:pt-14" role="status" aria-live="polite" aria-label="Loading Learn">
      <Bone className="h-3 w-16" />
      <Bone className="mt-4 h-12 w-full max-w-md" />
      <Bone className="mt-4 h-4 w-full max-w-lg" />
      <Bone className="mt-12 aspect-[4/3] rounded-[2rem] lg:aspect-[2.4/1]" />
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-72 rounded-3xl" />
        ))}
      </div>
    </Container>
  );
}
