"use client";
// HQ console error boundary: keeps the sidebar, explains plainly, offers a retry.
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HqError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
        <TriangleAlert className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="font-display text-xl font-semibold text-ink-950">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-ink-500">Something went wrong on our side — nothing you entered was lost. Try again, and if it keeps happening, quote this reference to support.</p>
      {error.digest && <p className="mt-3 font-mono text-xs text-ink-500">Ref {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={() => retry()}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
        <ButtonLink href="/hq" variant="outline">
          Network overview
        </ButtonLink>
      </div>
    </Card>
  );
}
