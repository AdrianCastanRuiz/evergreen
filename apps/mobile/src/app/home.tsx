import * as React from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth";

// Staff (and non-family) single-screen landing — Story 1.10 AC #2. Staff see
// ONLY the single-screen photo-upload flow and NO tab bar. The functional
// upload surface is Story 4.1 (Epic 4); this establishes the role-scoped
// single screen. Admin/super_admin keep this screen too on mobile (they have
// no dedicated mobile face in this story; the portal is their home surface).
export default function StaffScreen() {
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
    <EmptyState
      title={user?.name ?? "Welcome"}
      body="Photo upload is coming soon."
    >
      <Button variant="outline" disabled={loggingOut} onPress={handleLogOut}>
        <Text>Log out</Text>
      </Button>
    </EmptyState>
  );
}