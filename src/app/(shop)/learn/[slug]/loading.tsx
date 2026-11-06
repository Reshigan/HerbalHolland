import { Bone } from "@/components/shop/skeleton";
import { Container } from "@/components/shop/ui";

export default function Loading() {
  return (
    <Container className="pt-8" role="status" aria-live="polite" aria-label="Loading the article">
      <div className="max-w-2xl">
        <Bone className="h-3 w-24" />
        <Bone className="mt-6 h-3 w-20" />
        <Bone className="mt-4 h-11 w-full" />
        <Bone className="mt-3 h-11 w-2/3" />
        <Bone className="mt-6 h-4 w-full" />
        <Bone className="mt-2 h-4 w-5/6" />
        <Bone className="mt-8 aspect-[16/9] rounded-3xl" />
        <div className="mt-8 space-y-3">
          {["w-full", "w-11/12", "w-full", "w-4/5"].map((w, i) => (
            <Bone key={i} className={`h-4 ${w}`} />
          ))}
        </div>
      </div>
    </Container>
  );
}
