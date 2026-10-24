// Learn quests: a short quiz at the end of an article earns points once. Answers live here (server-side);
// pages send only the questions and options to the browser.
export type Quest = { title: string; points: number; questions: { q: string; options: string[]; answer: number }[] };

export const QUESTS: Record<string, Quest> = {
  "reading-lab-results": {
    title: "How to read a lab result",
    points: 10,
    questions: [
      { q: "What does PASS mean on a safety panel?", options: ["The product is organic", "The lab measured it below its action limit", "The batch hasn't been tested yet"], answer: 1 },
      { q: "Which batches do we sell?", options: ["Only batches marked Released", "Batches on hold, at a discount", "Any batch with a QR code"], answer: 0 },
      { q: "What are terpenes?", options: ["A kind of pesticide", "The laboratory's reference numbers", "The aromatic compounds that give a cultivar its smell"], answer: 2 },
    ],
  },
  "cbd-schedule-0": {
    title: "CBD & Schedule 0, explained",
    points: 10,
    questions: [
      { q: "How much CBD may a Schedule 0 sales pack contain?", options: ["Any amount", "No more than 600 mg", "No more than 2,000 mg"], answer: 1 },
      { q: "What is the maximum daily serving of CBD?", options: ["20 mg", "100 mg", "There's no limit"], answer: 0 },
      { q: "Can Schedule 0 CBD claim to treat a condition?", options: ["Yes, if it's on the label", "Only when sold online", "No. Only general health claims are allowed"], answer: 2 },
    ],
  },
  "heritage-landraces": {
    title: "Heritage landraces & the people who grow them",
    points: 10,
    questions: [
      { q: "Where does Swazi Gold come from?", options: ["The Eswatini highlands", "The Karoo", "Amsterdam"], answer: 0 },
      { q: "Which landrace left South Africa in the 1970s and became a global benchmark?", options: ["Malawi Gold", "Durban Poison", "Mpondo Gold"], answer: 1 },
      { q: "What is a landrace?", options: ["A plant shaped over generations by one place and its growers", "A hybrid bred in a lab", "A brand of rolling papers"], answer: 0 },
    ],
  },
  "responsible-use": {
    title: "Adults only, and always on your terms",
    points: 10,
    questions: [
      { q: "Who can buy from Herbal Holland?", options: ["Adults 18+ only", "Anyone with a Rewards card", "Anyone 16+ with a parent"], answer: 0 },
      { q: "How long can edibles take to have an effect?", options: ["About two minutes", "Up to two hours", "They take effect immediately"], answer: 1 },
      { q: "Can you drive after using products that contain THC?", options: ["Yes, after an hour", "Only short distances", "No. Plan your journey home first"], answer: 2 },
    ],
  },
  "section-21": {
    title: "Registered patients & Section 21",
    points: 10,
    questions: [
      { q: "Who applies to SAHPRA for a Section 21 authorisation?", options: ["Your doctor", "The store", "You, online"], answer: 0 },
      { q: "Can licensed medicines be discounted or earn points?", options: ["Yes, double points on Fridays", "No. The Medicines Act prohibits incentives on medicines", "Only for Harvest members"], answer: 1 },
    ],
  },
  "caring-for-accessories": {
    title: "Caring for your accessories",
    points: 10,
    questions: [
      { q: "What should you never do with glass?", options: ["Rinse it with warm water", "Pour boiling water onto it when it's cold", "Let it dry before use"], answer: 1 },
      { q: "How do you clear a sticky grinder?", options: ["Freeze it, then brush it", "Run it under boiling water", "Oil the teeth"], answer: 0 },
      { q: "Where should accessories be stored?", options: ["On a sunny windowsill", "In the car", "Somewhere cool, dry and locked away"], answer: 2 },
    ],
  },
  points: {
    title: "How Rewards points work",
    points: 10,
    questions: [
      { q: "What is one Rewards point worth?", options: ["10c", "R10", "R1"], answer: 2 },
      { q: "When do members get their instant savings?", options: ["As soon as they're identified at the till or signed in online", "Only on their birthday", "At the end of each month"], answer: 0 },
    ],
  },
};

/** True when every answer is right (answers = chosen option index per question). */
export const questPassed = (key: string, answers: number[]) => {
  const q = QUESTS[key];
  return !!q && q.questions.length === answers.length && q.questions.every((x, i) => x.answer === answers[i]);
};

/** What the browser may see: questions and options, no answers. */
export const publicQuest = (key: string) => {
  const q = QUESTS[key];
  return q ? { key, title: q.title, points: q.points, questions: q.questions.map(({ q: text, options }) => ({ q: text, options })) } : null;
};
