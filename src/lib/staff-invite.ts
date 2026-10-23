// A staff member's own join link: /club/join?src=staff-xxxxxxxx. The tag is the end of their user id (no name, nothing
// to look up), stored on the member as joinedVia, so sign-ups from the link are credited to them.
export const staffTag = (userId: string) => `staff-${userId.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase()}`;
export const staffJoinPath = (userId: string) => `/club/join?src=${staffTag(userId)}`;
