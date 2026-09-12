import * as React from "react";
import { View } from "react-native";

import { AccountActions } from "@/components/account-actions";
import {
  ResidentProfileCard,
  ResidentProfileCardSkeleton,
} from "@/components/resident-profile-card";
import { ResidentSwitcher } from "@/components/resident-switcher";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Text } from "@/components/ui/text";
import { useResidents } from "@/lib/resident-context";

// Family Home tab (FR10, UX-DR13). Story 2.3 (AC #1/#2): renders the linked
// resident(s) switcher (a dropdown, for any 2+ links) above a resident
// summary card for the active resident. Story 2.4 (AC #1/#2, FR21,
// UX-DR8/UX-DR30): replaces the minimal card with the real
// resident-profile-card and shows its skeleton while the linked-residents
// query loads (per UX-DR30's explicit "skeleton placeholder matching the
// card's layout" — no spinner or blank).
//
// The single-resident case (AC #1) intentionally shows NO switcher — just the
// card. The zero-linked case is structurally unreachable once the _layout.tsx
// gate (Task 6) routes zero-link family to onboarding, but is handled
// defensively here rather than crashing.
//
// The two session actions family needs (FR4/FR9: My Profile, Log out) sit in
// one fixed top-right icon row (AccountActions) instead of full-width
// buttons duplicated per state below — they're account-level, not something
// that should compete with or shift around the actual Home content.
export default function HomeTabScreen() {
  const { residents, isLoading, error, refetch, activeResidentId, setActiveResidentId } =
    useResidents();

  const list = residents ?? [];
  const activeResident = list.find((r) => r.id === activeResidentId);

  return (
    <View className="flex-1 bg-background px-gutter pt-4">
      <AccountActions className="flex-row justify-end gap-1" />

      <View className="mt-3 flex-1">
        {isLoading && !residents ? (
          <ResidentProfileCardSkeleton />
        ) : error ? (
          <EmptyState
            title="Home"
            body="We couldn't load your residents. Check your connection and try again."
          >
            <Button variant="outline" onPress={() => void refetch()}>
              <Text>Retry</Text>
            </Button>
          </EmptyState>
        ) : list.length === 0 ? (
          // Defensive, per UX-DR17/EXPERIENCE.md: Task 6's gate should have
          // routed zero-link family to onboarding, so this is normally
          // unreachable.
          <EmptyState
            title="Home"
            body="No residents are linked to your account yet."
          />
        ) : (
          <View className="gap-3">
            {list.length >= 2 ? (
              <ResidentSwitcher
                residents={list}
                activeResidentId={activeResidentId}
                onSelect={setActiveResidentId}
              />
            ) : null}

            {activeResident ? (
              <ResidentProfileCard resident={activeResident} />
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
