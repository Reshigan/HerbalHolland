// Store-side posting rules (filled in by the store-side build).
import type { SourceHandler } from "../core";

export const STORE_SOURCES: Record<string, SourceHandler> = {};

export async function storeNightly(_now: Date): Promise<{ source: string; sourceId: string }[]> {
  return [];
}
