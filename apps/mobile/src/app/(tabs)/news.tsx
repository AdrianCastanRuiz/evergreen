import { EmptyState } from "@/components/ui/empty-state";

// Family News tab (FR10, UX-DR13). Placeholder established by Story 1.10;
// the home's published news posts land in Epic 3 (Story 3.2).
export default function NewsTabScreen() {
  return <EmptyState title="News" body="Nothing posted yet." />;
}