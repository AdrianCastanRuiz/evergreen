import * as React from "react";
import { router } from "expo-router";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth";

// Family Home tab (FR10, UX-DR13). Placeholder established by Story 1.10;
// the resident-profile-card / linked-resident content lands in Epic 2
// (Story 2.3/2.4). Hosts the two session actions family needs (FR4/FR9):
// My Profile and Log out — family no longer reaches home.tsx (that screen is
// now the staff/non-family single screen), so the tab shell is where family
// closes the session.
export default function HomeTabScreen() {
  const { signOut } = useAuth();
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
    <EmptyState title="Home" body="Your home content will appear here soon.">
      <Button
        variant="outline"
        disabled={loggingOut}
        onPress={() => router.push("/profile")}
      >
        <Text>My Profile</Text>
      </Button>
      <Button variant="outline" disabled={loggingOut} onPress={handleLogOut}>
        <Text>Log out</Text>
      </Button>
    </EmptyState>
  );
}