import { Text, View } from "react-native";

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
    </View>
  );
}
