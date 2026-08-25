import { router } from "expo-router";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

// Family landing target of the splash resolution (FR8). Story 1.8 replaces
// this placeholder with the real invite-code onboarding flow.
export default function OnboardingScreen() {
  const { user } = useAuth();

  return (
    <View className="flex-1 items-center justify-center bg-background px-gutter">
      <Text className="font-heading text-2xl text-foreground">
        Welcome{user?.name ? `, ${user.name}` : ""}
      </Text>
      <Text className="mt-2 text-center text-muted-foreground">
        Your family onboarding is coming soon.
      </Text>
      {/* Interim access point for Story 1.9's profile screen — Story 1.10
          replaces this whole placeholder screen (and this button) with real
          role-based navigation. */}
      <Button
        className="mt-8"
        variant="outline"
        onPress={() => router.push("/profile")}
      >
        <Text>My Profile</Text>
      </Button>
    </View>
  );
}
