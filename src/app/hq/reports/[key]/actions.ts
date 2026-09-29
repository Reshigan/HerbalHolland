"use server";
// "Email me this weekly/monthly": schedules the report as the signed-in HQ user, with their current filters.
import { revalidatePath } from "next/cache";
import { getStaff, HQ_ROLES } from "@/server/auth";
import { actorOf, fail, done, DENIED, type ActionState } from "@/server/hq/guard";
import { str, splitList } from "@/server/hq/form";
import { createSchedule, ExportError, scheduleLabel, stopSchedule } from "@/server/exports";
import type { ExportCadence } from "@/generated/prisma/client";

export async function scheduleExport(reportKey: string, query: Record<string, string>, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getStaff();
  if (!user || !HQ_ROLES.includes(user.role)) return DENIED;
  const cadence = (str(fd, "cadence") === "MONTHLY" ? "MONTHLY" : "WEEKLY") as ExportCadence;
  const day = Number(str(fd, "day"));
  const recipients = splitList(str(fd, "recipients"));
  try {
    const s = await createSchedule(user, { reportKey, params: { scope: "hq", ...query }, cadence, dayOfWeek: cadence === "WEEKLY" ? day : null, dayOfMonth: cadence === "MONTHLY" ? day : null, recipients }, actorOf(user));
    revalidatePath(`/hq/reports/${reportKey}`);
    return done(`Scheduled: ${scheduleLabel(s).toLowerCase()} to ${s.recipients.join(", ")}. The CSV link arrives by email after the 03:00 run.`);
  } catch (e) {
    if (e instanceof ExportError) return fail(e.message, e.field ? { [e.field]: e.message } : undefined);
    throw e;
  }
}

export async function unscheduleExport(reportKey: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  const user = await getStaff();
  if (!user || !HQ_ROLES.includes(user.role)) return DENIED;
  try {
    await stopSchedule(user, id, actorOf(user));
    revalidatePath(`/hq/reports/${reportKey}`);
    return done("Schedule stopped.");
  } catch (e) {
    if (e instanceof ExportError) return fail(e.message);
    throw e;
  }
}
