// A month of Google Business Profile posts for one store, from a Monday, posted by hand. Google's rules ban promoting
// regulated products, so these carry no product or offer words at all: the store, Rewards, Learn and events only, and
// written to read right for any store in the network.
import type { Playbook } from "../studio";

export const GOOGLE: Playbook[] = [
  {
    key: "google-month",
    name: "Google profile: a month for one store",
    blurb: "Four Monday posts for one store's Google profile, posted by hand: the hours and how to find us, joining Herbal Holland Rewards at the till, reading a label with the team, and the store's monthly Gezellig evening. Store and event news only: no product or offer words.",
    store: true,
    weekday: 1,
    why: "Google posts go up on Monday mornings",
    anchor: "The first Monday",
    items: [
      {
        key: "find-us", day: 0, time: "09:00", channel: "GOOGLE",
        text: "Visiting {store}? Find us at {address}. Opening hours: {hours}. Public holiday hours are on our page at shop.herbalholland.com. Herbal Holland is members only, for adults 18+: bring your ID, because we check it at the door and the till, every time.",
      },
      {
        key: "join", day: 7, time: "09:00", channel: "GOOGLE",
        text: "Join Herbal Holland Rewards free at the till at {store}. Everyone who shops with us is a member, and membership is for adults 18+: bring your ID and the team will set you up. Your Rewards card lives in the Rewards app, and your membership works in every Herbal Holland store and online at shop.herbalholland.com. Adults 18+.",
      },
      {
        key: "labels", day: 14, time: "09:00", channel: "GOOGLE",
        text: "Ask the team at {store} to read a label with you. We'll walk you through it, line by line, in plain English: what it is, the numbers and what's in it. Questions are always welcome. Adults 18+, bring your ID.",
      },
      {
        key: "gezellig", day: 21, time: "09:00", channel: "GOOGLE",
        text: "Every month, {store} hosts a Gezellig evening, 18:00–20:00, for members of Herbal Holland Rewards. Gezellig is Dutch for warm, sociable, at home: an evening at the store with the team and fellow members. For the next date, ask the team or see the Rewards app, where members RSVP. Adults 18+, ID at the door.",
      },
    ],
  },
];
