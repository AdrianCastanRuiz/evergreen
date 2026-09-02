import { createRoute } from "@tanstack/react-router";
import type { Role } from "@evergreen/shared-types";

import { useAuth } from "@/lib/auth";
import { protectedLayoutRoute } from "@/routes/protected-layout";

export const profileRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/profile",
  component: ProfilePage,
});

const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin",
  admin: "Home admin",
  staff: "Staff",
  family: "Family",
};

function ProfilePage() {
  const { user } = useAuth();

  // protected-layout.tsx already guarantees status === "authenticated" by
  // the time this renders — a null user here means the post-login /auth/me
  // fetch hasn't resolved yet (same handling as care-homes.tsx/users.tsx).
  if (!user) {
    return <p className="p-6 text-muted-foreground">Loading your account…</p>;
  }

  return (
    <div className="max-w-lg rounded-md border border-border bg-card p-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        Profile
      </h1>

      <dl className="mt-6 flex flex-col gap-4">
        <ProfileField label="Name" value={user.name ?? "—"} />
        <ProfileField label="Email" value={user.email} />
        <ProfileField label="Role" value={ROLE_LABELS[user.role]} />
        {/* null for super_admin, who isn't scoped to a single home. */}
        {user.homeName ? (
          <ProfileField label="Care home" value={user.homeName} />
        ) : null}
      </dl>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[15px] text-foreground">{value}</dd>
    </div>
  );
}
