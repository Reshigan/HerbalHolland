"use client";
// Error fallback for report pages (the loading skeleton lives in skeleton.tsx).
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

export function ReportError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error("[report]", error), [error]);
  return (
    <Card className="mt-2">
      <EmptyState
        icon={<TriangleAlert className="h-5 w-5" />}
        title="This report couldn't be loaded"
        action={
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
        }
      >
        Something went wrong while running it. Try again, or pick a shorter date range or a single store.
        {error.digest ? <span className="mt-2 block text-xs text-ink-400">Reference {error.digest}</span> : null}
      </EmptyState>
    </Card>
  );
}
