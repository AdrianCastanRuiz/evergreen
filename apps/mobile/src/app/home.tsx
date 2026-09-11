import { View } from "react-native";

import { AccountActions } from "@/components/account-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth";

// Staff (and non-family) single-screen landing — Story 1.10 AC #2. Staff see
// ONLY the single-screen photo-upload flow and NO tab bar. The functional
// upload surface is Story 4.1 (Epic 4); this establishes the role-scoped
// single screen. Admin/super_admin keep this screen too on mobile (they have
// no dedicated mobile face in this story; the portal is their home surface).
//
// My Profile (FR4, Story 1.9 — staff/non-family must keep a way to reach it,
// or they never reach onboarding to get there) and Log out (FR9) sit in a
// fixed top-right icon row, same as the family Home tab.
export default function StaffScreen() {
  const { user } = useAuth();

  return (
    <View className="flex-1 bg-background px-gutter pt-16">
      <AccountActions className="flex-row justify-end gap-1" />
      <EmptyState
        title={user?.name ?? "Welcome"}
        body="Photo upload is coming soon."
      />
    </View>
  );
}
