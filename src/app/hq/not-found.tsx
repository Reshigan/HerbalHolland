import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HqNotFound() {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <SearchX className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="font-display text-xl font-semibold text-ink-950">Not found</h1>
      <p className="mt-2 text-sm text-ink-500">That page or record doesn&apos;t exist, was removed, or sits outside what you look after.</p>
      <div className="mt-6 flex justify-center">
        <ButtonLink href="/hq" variant="outline">
          Back to the network overview
        </ButtonLink>
      </div>
    </Card>
  );
}
