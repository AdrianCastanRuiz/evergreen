import * as React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { useResidents } from "@/lib/resident-context";

// Persistent header shown above every family tab ((tabs)/_layout.tsx),
// naming the active resident's care home — the mobile equivalent of the
// admin portal's top bar (which shows the same "Evergreen | <Home name>"
// pairing). Re-derives from the same activeResidentId the resident-switcher
// already drives, so it re-labels automatically on resident switch, the same
// re-scope-on-switch behavior every other tab already has (Story 2.3 AC #3).
//
// First real usage of useSafeAreaInsets in apps/mobile (every other screen
// so far uses a flat `pt-16` guess instead) — this header sits above
// everything else, so it's the one place that actually needs the device's
// real top inset rather than an approximation.
export function HomeHeader() {
  const insets = useSafeAreaInsets();
  const { residents, activeResidentId } = useResidents();
  const homeName = residents?.find((r) => r.id === activeResidentId)
    ?.homeName;

  // Nothing to show yet (residents still loading, or none active) — render
  // just the safe-area spacer so the tab content below doesn't jump once the
  // name resolves a moment later.
  return (
    <View
      style={{ paddingTop: insets.top }}
      className="border-b border-border bg-card"
    >
      <View className="h-11 items-center justify-center px-gutter">
        {homeName ? (
          <Text
            numberOfLines={1}
            className="font-heading-sm text-[15px] text-foreground"
          >
            {homeName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
