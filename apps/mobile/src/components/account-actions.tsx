import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as React from "react";
import { View } from "react-native";

import { IconButton } from "@/components/ui/icon-button";
import { useLogOut } from "@/lib/use-log-out";

// The two session-level actions every authenticated screen needs (FR4/FR9:
// My Profile, Log out) — a compact top-right icon row instead of two
// full-width buttons competing with the screen's actual content for space.
// `showProfile={false}` on the Profile screen itself, where a link back to
// it makes no sense.
interface AccountActionsProps {
  showProfile?: boolean;
  className?: string;
}

export function AccountActions({
  showProfile = true,
  className,
}: AccountActionsProps) {
  const { handleLogOut, loggingOut } = useLogOut();

  return (
    <View className={className}>
      {showProfile ? (
        <IconButton
          accessibilityLabel="My Profile"
          onPress={() => router.push("/profile")}
        >
          <Ionicons name="person-circle-outline" size={24} color="#5C5C5C" />
        </IconButton>
      ) : null}
      <IconButton
        accessibilityLabel="Log out"
        disabled={loggingOut}
        onPress={handleLogOut}
      >
        <Ionicons name="log-out-outline" size={22} color="#5C5C5C" />
      </IconButton>
    </View>
  );
}
