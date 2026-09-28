"use server";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { audit } from "@/server/audit";
import { completeQuest } from "@/server/quests";
import { publicQuest } from "@/lib/quests";

export type QuestResult = { passed?: boolean; points?: number; error?: string };

/** Checks a Learn quiz server-side (answers never reach the browser) and awards points once. */
export async function completeQuestAction(slug: string, answers: number[]): Promise<QuestResult> {
  const customer = await getCustomer();
  if (!customer) return { error: "Sign in to earn points for this quiz" };
  const quest = publicQuest(slug);
  if (!quest) return { error: "This quiz isn't available" };
  const valid = Array.isArray(answers) && answers.length === quest.questions.length && answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < quest.questions[i].options.length);
  if (!valid) return { error: "Answer every question, then try again" };
  const r = await completeQuest(customer.id, slug, answers);
  if (r.passed && r.points)
    await audit(db, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "loyalty.quest_points", { entity: "QuestCompletion", entityId: slug, data: { points: r.points } });
  return { passed: r.passed, points: r.points };
}
