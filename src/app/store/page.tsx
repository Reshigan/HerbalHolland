import { redirect } from "next/navigation";
import { homeFor, requireStaff } from "@/server/auth";

export default async function StoreIndex() {
  const user = await requireStaff();
  redirect(await homeFor(user));
}
