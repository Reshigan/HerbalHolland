import type { Tone } from "@/components/ui/badge";

export const CLASS_TONE: Record<string, Tone> = { THC: "violet", CBD: "green", CBD_FOOD: "green", CBD_TOPICAL: "green", HEMP: "amber", SUPPLEMENT: "blue", ACCESSORY: "neutral", APPAREL: "orange", GROW: "blue" };
export const CHANNEL_LABEL: Record<string, string> = { SMS: "SMS", EMAIL: "Email", PUSH: "Push", WHATSAPP: "WhatsApp" };
export const KIND_TONE: Record<string, Tone> = { NEWS: "neutral", LAUNCH: "orange", POLICY: "blue", RECALL: "red" };

/** Live / Scheduled / Ended / Off for anything with an active flag and an optional date window. */
export function listStatus(l: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now = new Date()): [string, Tone] {
  if (!l.active) return ["Off", "neutral"];
  if (l.endsAt && l.endsAt < now) return ["Ended", "neutral"];
  if (l.startsAt && l.startsAt > now) return ["Scheduled", "blue"];
  return ["Live", "green"];
}
