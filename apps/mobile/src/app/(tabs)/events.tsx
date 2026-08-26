import { EmptyState } from "@/components/ui/empty-state";

// Family Events tab (FR10, UX-DR13). Placeholder established by Story 1.10;
// the events list/calendar for the home lands in Epic 5 (Story 5.2).
export default function EventsTabScreen() {
  return <EmptyState title="Events" body="No events scheduled right now." />;
}