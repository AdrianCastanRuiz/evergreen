import { Text, View } from "react-native";

import { useAuth } from "@/lib/auth";

// Role-appropriate home target of the splash resolution (FR8). Story 1.10
// replaces this placeholder with real role-based navigation.
export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <View className="flex-1 items-center justify-center bg-background px-gutter">
      <Text className="font-heading text-2xl font-semibold text-foreground">
        {user?.name ?? "Welcome"}
      </Text>
      <Text className="mt-2 text-center text-muted-foreground">
        Role-based navigation is coming soon.
      </Text>
    </View>
  );
}
