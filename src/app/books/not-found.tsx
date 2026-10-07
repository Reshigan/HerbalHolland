import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Books someone can't open look the same as books that don't exist (ids can't be probed): requireBooks → notFound().
export default function BooksNotFound() {
  return (
    <main className="min-h-dvh bg-ink-50 px-4 py-16">
      <Card className="mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <SearchX className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="font-display text-xl font-semibold text-ink-950">Not found</h1>
        <p className="mt-2 text-sm text-ink-500">These books, or the page or record you followed, don&apos;t exist or sit outside what you look after.</p>
        <div className="mt-6 flex justify-center">
          <ButtonLink href="/books" variant="outline">
            All books
          </ButtonLink>
        </div>
      </Card>
    </main>
  );
}
