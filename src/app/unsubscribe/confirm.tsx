"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { unsubscribe } from "./actions";

export function Confirm({ c, ch, t, what }: { c: string; ch: string; t: string; what: string }) {
  const [state, action, pending] = useActionState(unsubscribe, null);
  if (state && "done" in state)
    return <p role="status" className="rounded-xl bg-ink-900 px-4 py-3 text-ink-100">Done — you won&apos;t get {what} from us any more. It can take up to 48 hours for scheduled messages to stop.</p>;
  return (
    <form action={action} className="grid gap-3">
      {["c", "ch", "t"].map((k, i) => <input key={k} type="hidden" name={k} value={[c, ch, t][i]} />)}
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Unsubscribing…" : `Stop ${what}`}</Button>
      {state && "error" in state && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
