import { SearchX } from "lucide-react";
import { getStaff, isHq } from "@/server/auth";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Inside the back-office shell: a store outside what the person looks after (or no such store — the two look the same),
// a page their role doesn't open, or a record that's gone. Next prepares this with every store page, so it makes no
// queries of its own: /store sends people home (homeFor).
export default async function StoreNotFound() {
  const user = await getStaff();
  const hq = !!user && isHq(user);
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <SearchX className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="font-display text-xl font-semibold text-ink-950">Not found</h1>
      <p className="mt-2 text-sm text-ink-500">This store sits outside what you look after, or the page or record you followed doesn&apos;t exist any more.</p>
      <div className="mt-6 flex justify-center">
        <ButtonLink href={hq ? "/hq" : "/store"} variant="outline">
          {hq ? "Back to the network overview" : "Back to my store"}
        </ButtonLink>
      </div>
    </Card>
  );
}
