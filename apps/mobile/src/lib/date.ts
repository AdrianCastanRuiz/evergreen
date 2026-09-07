// Story 2.4: formats a resident's DOB for the profile card. dob travels as an
// ISO-8601 date string over the wire (see packages/shared-types). No date lib
// existed in apps/mobile (checked: no dayjs/date-fns/luxon), so this is a tiny
// locale-safe-free formatter matching the DESIGN mock's "DOB 04 Mar 1938".
// Returns null for null/unparseable input so callers render nothing.

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatResidentDob(dob: string | null | undefined): string | null {
  if (!dob) return null;
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}