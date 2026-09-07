import type { LinkedResident } from "@evergreen/shared-types";
import * as React from "react";
import { Image, View } from "react-native";

import { Text } from "@/components/ui/text";
import { Skeleton } from "@/components/ui/skeleton";
import { formatResidentDob } from "@/lib/date";
import { residentPhotoUrl } from "@/lib/media";

// Story 2.4 (Task 1, AC #1, FR21, UX-DR8): the real resident-profile-card,
// replacing Story 2.3's minimal inline summary render in (tabs)/index.tsx.
//
// Follows DESIGN.md's resident-profile-card spec verbatim: `card` shape
// (`bg-card`, `border-border` hairline, `rounded-md`, `p-card-padding`), a
// `bg-primary` accent bar along the leading edge (matching event-list-item's
// leading-edge convention — no card in this codebase accents a different
// edge), photo, name in the heading type style, room + DOB.
//
// profilePhotoPublicId is a Cloudinary public id, not a URL (AD-4). The
// display URL is built at render time via residentPhotoUrl(); when it's null
// (no photo set — Story 2.1 made it optional, or no cloud name configured)
// we render initials in a placeholder avatar, never a broken image.
interface ResidentProfileCardProps {
  resident: LinkedResident;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (
    parts[0].slice(0, 1).toUpperCase() +
    parts[parts.length - 1].slice(0, 1).toUpperCase()
  );
}

export function ResidentProfileCard({ resident }: ResidentProfileCardProps) {
  const photoUrl = residentPhotoUrl(resident.profilePhotoPublicId);
  const room = resident.room ? `Room ${resident.room}` : null;
  const dob = formatResidentDob(resident.dob);

  const meta = [room, dob ? `DOB ${dob}` : null].filter(Boolean).join(" · ");

  return (
    <View className="relative flex-row items-center gap-3 overflow-hidden rounded-md border border-border bg-card pb-card-padding pt-card-padding pr-card-padding pl-[22px]">
      {/* Accent bar along the leading edge (DESIGN.md component spec). */}
      <View className="pointer-events-none absolute bottom-0 left-0 top-0 w-[6px] bg-primary" />

      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          className="h-16 w-16 rounded-full bg-muted"
          accessibilityRole="image"
          accessibilityLabel={`${resident.name} photo`}
        />
      ) : (
        <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Text className="font-heading text-[22px] text-secondary">
            {initials(resident.name)}
          </Text>
        </View>
      )}

      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="font-heading text-[22px] leading-[26px] text-foreground"
        >
          {resident.name}
        </Text>
        {meta ? (
          <Text className="mt-0.5 text-sm text-muted-foreground">{meta}</Text>
        ) : null}
      </View>
    </View>
  );
}

// Story 2.4 (Task 2, AC #2, UX-DR30): the skeleton shown while the
// linked-residents query is loading, laid out to mirror the real card (accent
// bar, avatar block, name line, meta line) so there's no layout jump when data
// arrives. Rendered as a sibling export so (tabs)/index.tsx can swap it in.
export function ResidentProfileCardSkeleton() {
  return (
    <View className="relative flex-row items-center gap-3 overflow-hidden rounded-md border border-border bg-card pb-card-padding pt-card-padding pr-card-padding pl-[22px]">
      {/* Accent bar mirrored from the real card (M1, UX-DR30 layout-match). */}
      <View className="pointer-events-none absolute bottom-0 left-0 top-0 w-[6px] bg-primary/40" />
      <Skeleton className="h-16 w-16 rounded-full" />
      <View className="flex-1">
        <Skeleton className="h-5 w-2/3 rounded-sm" />
        <Skeleton className="mt-2 h-4 w-1/2 rounded-sm" />
      </View>
    </View>
  );
}
