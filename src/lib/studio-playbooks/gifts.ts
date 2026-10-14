// Black Friday week 2026: no sale, one email. The merch as gifts, at its usual prices, the Thursday before the stores
// open (so collection starts on opening day).
import type { Playbook } from "../studio";
import { paras } from "./shared";

export const GIFTS: Playbook[] = [
  {
    key: "gifts-2026",
    name: "The gift email, November 2026",
    blurb: "One email in Black Friday week instead of a sale: the merch as gifts, delivered anywhere in South Africa, and collected in store from opening day.",
    store: false,
    anchor: "Thursday 26 November",
    date: "2026-11-26",
    items: [
      {
        key: "email", day: 0, time: "16:00", channel: "EMAIL",
        title: "Gift the windmill this festive season",
        text: paras(
          "Hi {{firstName}},",
          "It's the week of big sales. We don't run one. Instead, here's a short guide to our merch, for anyone on your list who'd wear the windmill.",
          "For summer days: the Windmill Tee, heavyweight black cotton in a men's and a ladies' fit, with the windmill embroidered on the chest and our store-window poster printed across the back; the Windmill Cap in washed cotton; and the Sunset Bucket Hat in cotton twill, each with the windmill embroidered in Sunset orange.",
          "For the evenings: the Sunset Hoodie, heavyweight Sunset-orange fleece cut unisex, with our lock-up embroidered on the chest and “Dutch heritage. African soil.” embroidered across the back; the Harrington Jacket, black cotton twill lined in our Sunset check; the Heritage Crewneck, heavyweight black fleece with “Dutch heritage. African soil.” embroidered across the chest; and the Windmill Beanie, with the windmill on its cuff.",
          "And for everything else: the Windmill Tote, heavy black cotton canvas with our lock-up printed in Sunset orange.",
          "It's all in stock and delivered anywhere in South Africa, with tracking by SMS. We hand every parcel only to the member named on the order, who may be asked for ID, so have it delivered to you and do the wrapping yourself. Or collect it at your store, and from Tuesday 1 December at our new stores in Hillcrest and Hilton too.",
          "It's all at shop.herbalholland.com.",
          "Happy gifting,\nThe Herbal Holland team",
        ),
      },
    ],
  },
];
