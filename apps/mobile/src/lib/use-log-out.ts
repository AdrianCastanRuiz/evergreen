import * as React from "react";
import { Alert } from "react-native";

import { useAuth } from "@/lib/auth";

// Shared by every "Log out" button ((tabs)/index.tsx, home.tsx, profile.tsx)
// — same confirm step and in-flight guard everywhere, mirroring
// apps/admin's own "Log out?" AlertDialog (top-nav.tsx) so the confirmation
// wording matches across clients.
export function useLogOut(): { handleLogOut: () => void; loggingOut: boolean } {
  const { signOut } = useAuth();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogOut = React.useCallback(() => {
    if (loggingOut) return;
    Alert.alert("Log out?", "You'll need to sign in again to access the app.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          setLoggingOut(true);
          signOut().finally(() => setLoggingOut(false));
        },
      },
    ]);
  }, [loggingOut, signOut]);

  return { handleLogOut, loggingOut };
}
