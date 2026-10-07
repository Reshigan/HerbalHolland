"use client";
// Brings a line asked for by link (from its journal, say) into view once the page has loaded.
import { useEffect } from "react";

export function ScrollTo({ id }: { id: string }) {
  // A block body: newer Chrome returns a Promise from scrollIntoView, and React calls whatever an effect returns as its
  // cleanup ("is not a function", and the page shows its error screen).
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [id]);
  return null;
}
