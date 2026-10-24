// The Windmill before the shop opens: one email (and its push) to members who said yes to email, while the KZN
// stores trade and the online shop is still on its way. No. 1 follows on opening day (./launch). HQ picks the Tuesday
// (the email day) in the Studio, before the shop opens: the shop launch pack already emails members on opening day.
import type { Playbook } from "../studio";
import { paras } from "./shared";

export const FIRST_LOOK: Playbook[] = [
  {
    key: "windmill-first-look-2026",
    name: "The Windmill: a first look, October 2026",
    blurb: "A short note to the first members while the Bluff and Pietermaritzburg stores trade: what's open, what's coming in December, this month's specials, a new Learn guide, and bringing a friend.",
    store: false,
    anchor: "Send day",
    weekday: 2,
    why: "so it goes out on a Tuesday, the email day",
    items: [
      {
        key: "email", day: 0, time: "16:00", channel: "EMAIL",
        title: "The Windmill: a first look",
        text: paras(
          "Hi {{firstName}},",
          "You're one of the first members of Herbal Holland Rewards, so before our first full newsletter, here's a short note on where things stand.",
          "Two stores are open. Pietermaritzburg and the Bluff in Durban are trading now, for members aged 18 and over. Show the QR code on your card at the till for your member price and points on every visit.",
          "Two more in December. Hillcrest, in the Upper Highway, and Hilton, in the Midlands, open on Tuesday 1 December. Invitations to the opening week follow.",
          "This month's specials. They come off automatically at the till, on top of your member price, with no codes. They're all in one place at shop.herbalholland.com/specials.",
          "A new Learn guide. Caring for your accessories: glass, grinders, papers and storage, with things you already have at home. It takes three minutes, and its quick quiz adds 10 points to your card.",
          "Bring a friend. Your link is in the Rewards app, with a Status card to share. When a friend (18+) joins with it and makes their first purchase, you each get points.",
          "See you in store,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push", day: 0, time: "18:30", channel: "PUSH",
        title: "The Windmill: a first look",
        text: "Two stores open, two more in December, and this month's specials. Your link is in the app.",
      },
    ],
  },
];
