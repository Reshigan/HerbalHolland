"use client";
// Brings a line asked for by link (from its journal, say) into view once the page has loaded.
import { useEffect } from "react";

export function ScrollTo({ id }: { id: string }) {
  useEffect(() => document.getElementById(id)?.scrollIntoView({ block: "center" }), [id]);
  return null;
}
