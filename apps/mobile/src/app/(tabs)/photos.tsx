import { EmptyState } from "@/components/ui/empty-state";

// Family Photos tab (FR10, UX-DR13). Placeholder established by Story 1.10;
// the photo gallery of a linked resident lands in Epic 4 (Story 4.2/4.3).
export default function PhotosTabScreen() {
  return <EmptyState title="Photos" body="No photos yet — check back soon." />;
}