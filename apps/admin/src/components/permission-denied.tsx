import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

// UX-DR25: role-gated or home-scoped access violation on the portal. A clear
// "You don't have access to this" message with a way back — never a silent
// failure or blank screen. Rendered by role-guarded routes when the current
// user's role isn't permitted.
export function PermissionDenied() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        You don't have access to this
      </h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        This area is limited to users with the right permission. Contact a
        home admin or super admin if you believe this is a mistake.
      </p>
      <Button variant="outline" className="mt-6" asChild>
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}