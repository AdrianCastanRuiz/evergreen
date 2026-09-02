import { createRoute } from "@tanstack/react-router";

import { RoleUsersPanel } from "@/components/role-users-panel";
import { PermissionDenied } from "@/components/permission-denied";
import { useAuth } from "@/lib/auth";
import { protectedLayoutRoute } from "@/routes/protected-layout";

export const familyRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/family",
  component: FamilyPage,
});

function FamilyPage() {
  const { user } = useAuth();

  // Same distinction care-homes.tsx/users.tsx make: a null user here means
  // the post-login /auth/me fetch hasn't resolved yet, not a permission
  // denial.
  if (!user) {
    return <p className="p-6 text-muted-foreground">Loading your account…</p>;
  }

  // Client-side UX only — sidebar-nav.tsx already hides this route from
  // every other role. The API's own @Roles('admin') on GET /users is what
  // actually enforces this either way.
  if (user.role !== "admin") {
    return <PermissionDenied />;
  }

  return <RoleUsersPanel role="family" title="Family" />;
}
