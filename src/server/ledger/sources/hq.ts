// HQ and network posting rules (filled in by the HQ-side build).
import type { SourceHandler } from "../core";

export const HQ_SOURCES: Record<string, SourceHandler> = {};

export async function hqNightly(_now: Date): Promise<{ source: string; sourceId: string }[]> {
  return [];
}
