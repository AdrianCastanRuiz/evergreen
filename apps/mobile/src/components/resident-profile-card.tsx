import type { LinkedResident } from "@evergreen/shared-types";
import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { Image, Modal, Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format-date";
import { residentPhotoUrl } from "@/lib/media";
import { initials } from "@/lib/utils";

// Story 2.4 (Task 1, AC #1, FR21, UX-DR8): the real resident-profile-card,
// replacing Story 2.3's minimal inline summary render in (tabs)/index.tsx.
//
// Follows DESIGN.md's resident-profile-card spec, with one deliberate
// deviation: room only, no DOB (Adrian: don't show a resident's date of
// birth in the family view). `card` shape (`bg-card`, `border-border`
// hairline, `rounded-md`, `p-card-padding`), a `bg-primary` accent bar along
// the leading edge (matching event-list-item's leading-edge convention — no
// card in this codebase accents a different edge), photo, name in the
// heading type style, room.
//
// Tapping the card opens a detail modal with every field (room, date of
// birth, care home) and a larger photo — a deliberate, opt-in "view details"
// surface, distinct from the always-visible card above (Adrian: DOB is fine
// here even though the compact card omits it).
//
// profilePhotoPublicId is a Cloudinary public id, not a URL (AD-4). The
// display URL is built at render time via residentPhotoUrl(); when it's null
// (no photo set — Story 2.1 made it optional, or no cloud name configured)
// we render initials in a placeholder avatar, never a broken image.
interface ResidentProfileCardProps {
  resident: LinkedResident;
}

export function ResidentProfileCard({ resident }: ResidentProfileCardProps) {
  const [detailOpen, setDetailOpen] = React.useState(false);
  const photoUrl = residentPhotoUrl(resident.profilePhotoPublicId);
  const meta = resident.room ? `Room ${resident.room}` : null;

  return (
    <>
      <Pressable
        onPress={() => setDetailOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${resident.name}. View details`}
        className="active:opacity-80"
      >
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
      </Pressable>

      <Modal
        visible={detailOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailOpen(false)}
      >
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="px-gutter pb-6 pt-6"
        >
          <View className="flex-row justify-end">
            <IconButton
              accessibilityLabel="Close"
              onPress={() => setDetailOpen(false)}
            >
              <Ionicons name="close" size={24} color="#5C5C5C" />
            </IconButton>
          </View>

          <View className="mt-2 items-center gap-3">
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl }}
                className="h-32 w-32 rounded-full bg-muted"
                accessibilityRole="image"
                accessibilityLabel={`${resident.name} photo`}
              />
            ) : (
              <View className="h-32 w-32 items-center justify-center rounded-full bg-muted">
                <Text className="font-heading text-4xl text-secondary">
                  {initials(resident.name)}
                </Text>
              </View>
            )}
            <Text className="font-heading text-2xl text-foreground">
              {resident.name}
            </Text>
          </View>

          <View className="mt-6 gap-4">
            <DetailRow label="Room" value={resident.room ?? "Not set"} />
            <DetailRow
              label="Date of birth"
              value={formatDate(resident.dob) ?? "Not set"}
            />
            <DetailRow label="Care home" value={resident.homeName} />
          </View>
        </ScrollView>
      </Modal>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="border-b border-border pb-3">
      <Text className="font-caption text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-1 text-base text-foreground">{value}</Text>
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
