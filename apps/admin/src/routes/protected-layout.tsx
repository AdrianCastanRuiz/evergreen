import { createRoute, Navigate, Outlet } from "@tanstack/react-router";

import { Shell } from "@/components/layout/shell";
import { useAuth } from "@/lib/auth";
import { rootRoute } from "@/routes/root";

// Pathless layout route (Story 1.14 AC #1): every route mounted under this
// one gets the admin Shell chrome AND the auth guard — an unauthenticated
// visitor is redirected to /login before Shell/children ever render. /login
// itself is NOT a child of this route (it must render without the Shell).
export const protectedLayoutRoute = createRoute({
  id: "_protected",
  getParentRoute: () => rootRoute,
  component: ProtectedLayout,
});

function ProtectedLayout() {
  const { status } = useAuth();

  // rootRoute already renders the "resolving" splash and blocks children
  // until status settles — by the time this component runs, status is
  // either "authenticated" or "unauthenticated".
  if (status !== "authenticated") {
    return <Navigate to="/login" />;
  }

  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
