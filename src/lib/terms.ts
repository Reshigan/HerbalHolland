// Membership terms. We sell to members only; everyone accepts these terms when they join — online, in the Rewards
// app or at the till — and the version they accepted is recorded on their membership (Customer.termsVersion).
// The key terms are the ones that limit a member's rights or put obligations on them, so they're shown in plain
// language before anyone accepts (Consumer Protection Act s49). The full terms are at /legal/terms.
export const TERMS_VERSION = "2026-09-27";
export const TERMS_LABEL = "Version 1 · 27 September 2026";

export const KEY_TERMS = [
  "We sell to members only, and only to adults (18+). Show your ID whenever we ask.",
  "What you buy is for your own use. Don't resell it, pass it on or buy for someone else — that can be a crime, and it ends your membership.",
  "Licensed cannabis medicines need your doctor's SAHPRA authorisation, within its limits. Membership alone never entitles you to them.",
  "Never drive or operate machinery while impaired.",
  "Points and member savings have no cash value and never apply to licensed medicines.",
  "We confirm your age with a secure fingerprint of your ID number and keep the records the law requires (see the privacy notice).",
  "Most online orders can be cancelled within 7 days of delivery, and faulty goods can be repaired, replaced or refunded within 6 months.",
];

/** The question staff ask when someone joins in store. Their answer is recorded as consent with this wording (POPIA s69). */
export const DEALS_QUESTION = "Can we send you member deals, drops and news by SMS and email? You can opt out any time — just reply STOP.";
