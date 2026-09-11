import type { LinkedResident } from "@evergreen/shared-types";
import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { Image, Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { residentPhotoUrl } from "@/lib/media";
import { cn, initials } from "@/lib/utils";

// The family resident-switcher: a single tap-to-open dropdown whenever the
// caller has 2+ linked residents (rendered above the active resident's
// profile card — apps/mobile/src/app/(tabs)/index.tsx skips this entirely
// for a single link, per AC #1). Each row shows the resident's own photo
// (or initials, same placeholder convention as resident-profile-card) so a
// family member recognizes who they're picking, not just a name in a list.
interface ResidentSwitcherProps {
  residents: LinkedResident[];
  activeResidentId: string | undefined;
  onSelect: (id: string) => void;
}

function Avatar({ resident, size }: { resident: LinkedResident; size: number }) {
  const photoUrl = residentPhotoUrl(resident.profilePhotoPublicId);
  const style = { height: size, width: size };

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={style}
        className="rounded-full bg-muted"
        accessibilityRole="image"
        accessibilityLabel={`${resident.name} photo`}
      />
    );
  }
  return (
    <View
      style={style}
      className="items-center justify-center rounded-full bg-muted"
    >
      <Text className="font-heading text-xs text-secondary">
        {initials(resident.name)}
      </Text>
    </View>
  );
}

export function ResidentSwitcher({
  residents,
  activeResidentId,
  onSelect,
}: ResidentSwitcherProps) {
  const [open, setOpen] = React.useState(false);

  const activeResident = residents.find((r) => r.id === activeResidentId);

  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch resident"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 active:bg-muted"
        onPress={() => setOpen((v) => !v)}
      >
        {activeResident ? <Avatar resident={activeResident} size={32} /> : null}
        <Text
          numberOfLines={1}
          className="flex-1 font-body-emphasis text-[15px] text-foreground"
        >
          {activeResident?.name ?? "Select resident"}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="#5C5C5C"
        />
      </Pressable>

      {open ? (
        <View className="mt-1.5 gap-0.5 rounded-md border border-border bg-card p-1.5">
          {residents.map((r) => {
            const isActive = r.id === activeResidentId;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={`${r.name}${isActive ? ", selected" : ""}`}
                className={cn(
                  "flex-row items-center gap-3 rounded-sm px-2 py-2",
                  isActive ? "bg-primary/10" : "active:bg-muted",
                )}
                onPress={() => handleSelect(r.id)}
              >
                <Avatar resident={r} size={28} />
                <Text
                  numberOfLines={1}
                  className={cn(
                    "flex-1 text-[15px]",
                    isActive
                      ? "font-body-emphasis text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {r.name}
                </Text>
                {isActive ? (
                  <Ionicons name="checkmark" size={18} color="#1B853F" />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
