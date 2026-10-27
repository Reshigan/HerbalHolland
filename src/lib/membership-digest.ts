// The morning membership email's words (pure): totals, who joined in the last 24 hours, and where members came from.

export type DigestMember = { memberNo: string; name: string; joinedVia: string | null; at: string };
export type Digest = { day: string; total: number; verified: number; newCount: number; joined: DigestMember[]; bySource: { source: string; members: number }[] };

const via = (s: string | null) => s || "direct";

export function membershipDigestText(d: Digest) {
  const subject = `Herbal Holland members: ${d.total} (${d.newCount ? `+${d.newCount}` : "no new"} in 24 hours)`;
  const lines = [
    `Membership on ${d.day}`,
    "",
    `Members: ${d.total}`,
    `Joined in the last 24 hours: ${d.newCount}`,
    `Age verified with an ID: ${d.verified} of ${d.total}`,
    "",
    ...(d.joined.length
      ? ["New members:", ...d.joined.map((m) => `  ${m.memberNo}  ${m.name}  (${via(m.joinedVia)}, ${m.at})`), ...(d.newCount > d.joined.length ? [`  …and ${d.newCount - d.joined.length} more`] : []), ""]
      : []),
    "Where members came from (all time):",
    ...(d.bySource.length ? d.bySource.map((s) => `  ${via(s.source)}: ${s.members}`) : ["  none yet"]),
  ];
  return { subject, text: lines.join("\n") };
}
