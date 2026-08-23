import { createRoute } from "@tanstack/react-router";

import { rootRoute } from "@/routes/root";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});

function IndexPage() {
  return (
    <div className="rounded-md border border-border bg-card p-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        Admin portal — coming soon
      </h1>
      <p className="mt-2 text-muted-foreground">
        This is the scaffold for the Evergreen web admin portal (issue #27).
        Screens land story by story starting with Story 1.10 / 1.12.
      </p>
    </div>
  );
}
