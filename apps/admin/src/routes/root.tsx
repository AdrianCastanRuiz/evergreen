import { createRootRoute, Outlet } from "@tanstack/react-router";

import { Shell } from "@/components/layout/shell";

export const rootRoute = createRootRoute({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
});
