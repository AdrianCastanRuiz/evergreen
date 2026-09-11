import type { LinkedResident } from "@evergreen/shared-types";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

// Story 2.3 (Task 4, AC #2, UX-DR9): the family resident-switcher. Thresholds:
// 2-3 residents → a horizontal pill row; 4+ → a tap-to-open dropdown showing
// the active resident and a chevron. Both show the active resident emphasized.
//
// No dropdown primitive existed in apps/mobile/src/components/ui/ (only
// button/text/input/password-input/card/empty-state) at implementation time,
// so the 4+ dropdown is a minimal Pressable + inline list, not a heavy new
// dependency.
interface ResidentSwitcherProps {
  residents: LinkedResident[];
  activeResidentId: string | undefined;
  onSelect: (id: string) => void;
}

export function ResidentSwitcher({
  residents,
  activeResidentId,
  onSelect,
}: ResidentSwitcherProps) {
  const [open, setOpen] = React.useState(false);

  const activeResident = residents.find((r) => r.id === activeResidentId);
  const showDropdown = residents.length >= 4;

  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  if (showDropdown) {
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch resident"
          className="flex-row items-center justify-between rounded-full border border-border bg-background px-4 py-2"
          onPress={() => setOpen((v) => !v)}
        >
          <Text
            numberOfLines={1}
            className="flex-1 text-sm font-medium text-foreground"
          >
            {activeResident?.name ?? "Select resident"}
          </Text>
          <Text className="ml-2 shrink-0 text-muted-foreground">
            {open ? "\u25B2" : "\u25BC"}
          </Text>
        </Pressable>
        {open ? (
          <View className="mt-2 overflow-hidden rounded-md border border-border bg-card p-1">
            {residents.map((r) => {
              const isActive = r.id === activeResidentId;
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.name}${isActive ? ", selected" : ""}`}
                  className={cn(
                    "rounded-md px-3 py-2",
                    isActive && "bg-primary/10",
                  )}
                  onPress={() => handleSelect(r.id)}
                >
                  <Text
                    numberOfLines={1}
                    className={cn(
                      "text-sm",
                      isActive ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {r.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 pr-2"
      className="flex-grow-0 flex-shrink-0"
    >
      {residents.map((r) => {
        const isActive = r.id === activeResidentId;
        return (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={`${r.name}${isActive ? ", selected" : ""}`}
            className={cn(
              "max-w-[200px] rounded-full border px-3 py-2",
              isActive
                ? "border-primary bg-primary"
                : "border-border bg-background",
            )}
            onPress={() => handleSelect(r.id)}
          >
            <Text
              numberOfLines={1}
              className={cn(
                "text-sm",
                isActive ? "font-medium text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {r.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}