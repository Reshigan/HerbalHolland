// The network's launch phase (HQ → Settings): the brand site and social first, then online shopping, then the stores.
// Pure rules, so pages, actions and tests share one answer. Store status (ACTIVE / OPENING_SOON) still decides which
// stores trade; the phase decides what the shop lets people do at all.
export const LAUNCH_PHASES = ["BRAND", "ONLINE", "STORES"] as const;
export type LaunchPhase = (typeof LAUNCH_PHASES)[number];

export const PHASE_LABEL: Record<LaunchPhase, { title: string; text: string }> = {
  BRAND: { title: "Brand site", text: "Browse the range, join Rewards, follow the launch. No bag, no checkout." },
  ONLINE: { title: "Online shopping", text: "Courier delivery from the distribution centre. No click & collect or same-day until the stores open." },
  STORES: { title: "Stores open", text: "Everything: delivery, click & collect and same-day at the stores that are trading." },
};

export const isLaunchPhase = (v: unknown): v is LaunchPhase => LAUNCH_PHASES.includes(v as LaunchPhase);

/** Can anyone put something in a bag and pay for it online? */
export const canBuyOnline = (phase: LaunchPhase) => phase !== "BRAND";

/** The ways of getting an order the phase allows (the stores' own click & collect / same-day flags still apply). */
export const fulfilmentForPhase = (phase: LaunchPhase): ("COLLECT" | "SAME_DAY" | "COURIER")[] =>
  phase === "STORES" ? ["COLLECT", "SAME_DAY", "COURIER"] : phase === "ONLINE" ? ["COURIER"] : [];

export const PHASE_CLOSED = "Online shopping opens soon. Join Rewards and we'll tell you first.";
