// Shared by news.tsx (content publish date) and resident-profile-card.tsx
// (resident date of birth) — same "DD Mon YYYY" display, no locale-specific
// date library needed for this single format.
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
