// Learn quests: points once per passed article quiz (questions and answers: src/lib/quests.ts).
import { tx } from "./db";
import { addPoints } from "./loyalty";
import { QUESTS, questPassed } from "@/lib/quests";

export async function completeQuest(customerId: string, key: string, answers: number[]) {
  const quest = QUESTS[key];
  if (!quest) throw new Error("Unknown quest");
  if (!questPassed(key, answers)) return { passed: false as const, points: 0 };
  try {
    await tx(async (t) => {
      await t.questCompletion.create({ data: { customerId, key } });
      await addPoints(t, { customerId, points: quest.points, kind: "BONUS", note: `Learn: ${quest.title}` });
    });
    return { passed: true as const, points: quest.points };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { passed: true as const, points: 0 }; // already earned
    throw e;
  }
}
