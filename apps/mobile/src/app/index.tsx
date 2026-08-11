import { Redirect } from "expo-router";
import { Text, View } from "react-native";

import { useAuth } from "@/lib/auth";

// Splash / auth-resolution entry point (FR8): shows the splash while the
// AuthProvider resolves the keychain session, then redirects by auth state —
// login (no session), onboarding (family), or home (every other role).
// Onboarding (Story 1.8) and role-based navigation (Story 1.10) will replace
// the placeholder targets.
export default function IndexScreen() {
  const { status, user } = useAuth();

  if (status === "resolving") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="font-hero text-[34px] font-semibold leading-[39px] tracking-[-0.01em] text-foreground">
          Evergreen
        </Text>
      </View>
    );
  }

  if (status === "unauthenticated") {
    return <Redirect href="/login" />;
  }

  return <Redirect href={user?.role === "family" ? "/onboarding" : "/home"} />;
}
