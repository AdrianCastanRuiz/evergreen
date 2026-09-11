import * as React from "react";
import { router } from "expo-router";
import { View } from "react-native";

import {
  ResidentProfileCard,
  ResidentProfileCardSkeleton,
} from "@/components/resident-profile-card";
import { ResidentSwitcher } from "@/components/resident-switcher";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth";
import { useResidents } from "@/lib/resident-context";

// Family Home tab (FR10, UX-DR13). Story 2.3 (AC #1/#2): renders the linked
// resident(s) switcher (a dropdown, for any 2+ links) above a resident
// summary card for the active resident. Story 2.4 (AC #1/#2, FR21,
// UX-DR8/UX-DR30):
// replaces the minimal card with the real resident-profile-card and shows its
// skeleton while the linked-residents query loads (per UX-DR30's explicit
// "skeleton placeholder matching the card's layout" — no spinner or blank).
//
// The single-resident case (AC #1) intentionally shows NO switcher — just the
// card. The zero-linked case is structurally unreachable once the _layout.tsx
// gate (Task 6) routes zero-link family to onboarding, but is handled
// defensively here rather than crashing.
//
// Hosts the two session actions family needs (FR4/FR9): My Profile and Log
// out.
export default function HomeTabScreen() {
  const { signOut } = useAuth();
  const { residents, isLoading, error, refetch, activeResidentId, setActiveResidentId } =
    useResidents();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      setLoggingOut(false);
    }
  };

  const list = residents ?? [];

  if (isLoading && !residents) {
    return (
      <View className="flex-1 bg-background px-gutter pt-16">
        <ResidentProfileCardSkeleton />
        <View className="mt-auto pb-8">
          <Button variant="outline" onPress={() => router.push("/profile")}>
            <Text>My Profile</Text>
          </Button>
          <Button
            className="mt-3"
            variant="outline"
            disabled={loggingOut}
            onPress={handleLogOut}
          >
            <Text>Log out</Text>
          </Button>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Home"
        body="We couldn't load your residents. Check your connection and try again."
      >
        <Button variant="outline" onPress={() => void refetch()}>
          <Text>Retry</Text>
        </Button>
        <Button variant="outline" onPress={() => router.push("/profile")}>
          <Text>My Profile</Text>
        </Button>
        <Button variant="outline" disabled={loggingOut} onPress={handleLogOut}>
          <Text>Log out</Text>
        </Button>
      </EmptyState>
    );
  }

  const activeResident = list.find((r) => r.id === activeResidentId);

  if (list.length === 0) {
    // Defensive, per UX-DR17/EXPERIENCE.md: Task 6's gate should have routed
    // zero-link family to onboarding, so this is normally unreachable.
    return (
      <EmptyState
        title="Home"
        body="No residents are linked to your account yet."
      >
        <Button variant="outline" disabled={loggingOut} onPress={handleLogOut}>
          <Text>Log out</Text>
        </Button>
      </EmptyState>
    );
  }

  return (
    <View className="flex-1 bg-background px-gutter pt-16">
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

      <View className="mt-auto pb-8">
        <Button
          variant="outline"
          disabled={loggingOut}
          onPress={() => router.push("/profile")}
        >
          <Text>My Profile</Text>
        </Button>
        <Button
          className="mt-3"
          variant="outline"
          disabled={loggingOut}
          onPress={handleLogOut}
        >
          <Text>Log out</Text>
        </Button>
      </View>
    </View>
  );
}