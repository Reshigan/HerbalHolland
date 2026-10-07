// Campaign Studio playbooks (HQ → Marketing → Studio), in the voice and rules of docs/MARKETING-PLAN.md:
//   - premium and informative: every post teaches, shows or invites; no hype, no discount-led messages, no exclamation
//     marks or emoji; the news in the first line and "Adults 18+" last; at most three hashtags, one of them local;
//   - one way in each time: first access (herbalholland.com) before the shop opens, then joining free and the Founding
//     list, then Learn, events and Bring a friend;
//   - never: products for sale on social, anything about products on WhatsApp or Google, medical claims, the pharmacy
//     angle, franchise recruitment, 4/20;
//   - the times: feed at 07:00 (news, Learn, countdowns) or 19:00 (Reels, people, places), Saturdays 09:00, one a day;
//     LinkedIn Wednesday 12:00; WhatsApp Channel Thursday 12:30; Google Mondays 09:00; email Tuesday 16:00; push 18:30
//     on weekdays; SMS 10:00 on weekdays (Saturdays 09:00–12:59 for same-day news only).
// Every item passes screenDraft once laid out, and tests/studio.test.ts holds the rhythm.
import type { Playbook } from "../studio";
import { LAUNCH } from "./launch";
import { NEW_ONLINE } from "./new-online";
import { GOOGLE } from "./google";
import { GIFTS } from "./gifts";
import { FESTIVE } from "./festive";
import { JANUARY } from "./january";
import { FEBRUARY } from "./february";
import { MARCH } from "./march";

export const PLAYBOOKS: Playbook[] = [...LAUNCH, ...NEW_ONLINE, ...GOOGLE, ...GIFTS, ...FESTIVE, ...JANUARY, ...FEBRUARY, ...MARCH];
