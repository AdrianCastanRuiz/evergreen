import * as React from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

// Role-appropriate home target of the splash resolution (FR8). Story 1.10
// replaces this placeholder with real role-based navigation.
export default function HomeScreen() {
  const { user, signOut } = useAuth();
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

  return (
    <View className="flex-1 items-center justify-center bg-background px-gutter">
      <Text className="font-heading text-2xl text-foreground">
        {user?.name ?? "Welcome"}
      </Text>
      <Text className="mt-2 text-center text-muted-foreground">
        Role-based navigation is coming soon.
      </Text>
      <Button
        className="mt-8"
        variant="outline"
        disabled={loggingOut}
        onPress={handleLogOut}
      >
        <Text>Log out</Text>
      </Button>
    </View>
  );
}
