// Who may see licensed (THC) products online. In MEDICAL mode (the default) they are
// medicines: only a signed-in member with an ACTIVE SAHPRA patient authorisation sees
// the dispensary, and never with promotions. In ADULT_USE mode, signed-in age-verified adults.
import { cache } from "react";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { customerContext } from "@/server/compliance";
import { incentiveExcluded, REG_CLASSES, type ThcMode } from "@/lib/compliance";
import type { PatientAuth } from "@/generated/prisma/client";

export type DispensaryAccess =
  | { allowed: true; mode: "MEDICAL"; auth: PatientAuth; remainingGrams: number }
  | { allowed: true; mode: "ADULT_USE" }
  | { allowed: false; mode: ThcMode; reason: "SIGN_IN" | "NO_AUTHORISATION" | "VERIFY_AGE" };

export const getDispensaryAccess = cache(async (): Promise<DispensaryAccess> => {
  const [settings, customer] = await Promise.all([getSettings(), getCustomer()]);
  const mode = settings.compliance.thcMode;
  if (!customer) return { allowed: false, mode, reason: "SIGN_IN" };
  if (mode === "MEDICAL") {
    const ctx = await customerContext(customer.id);
    if (!ctx.auth || !ctx.customer?.patient) return { allowed: false, mode, reason: "NO_AUTHORISATION" };
    return { allowed: true, mode, auth: ctx.auth, remainingGrams: ctx.customer.patient.remainingGrams };
  }
  if (!customer.ageVerifiedAt) return { allowed: false, mode, reason: "VERIFY_AGE" };
  return { allowed: true, mode: "ADULT_USE" };
});

/** Classes split into the public catalogue and the licence-gated dispensary, from HQ settings. */
export const getClasses = cache(async () => {
  const s = (await getSettings()).compliance;
  return {
    licensed: s.licensedOnly,
    public: REG_CLASSES.filter((c) => !s.licensedOnly.includes(c)),
    noIncentives: incentiveExcluded(s),
    thcMode: s.thcMode,
  };
});
