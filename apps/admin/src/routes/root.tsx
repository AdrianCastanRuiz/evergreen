import { createRootRoute, Outlet } from "@tanstack/react-router";

// True root: no Shell here (the login screen must not render inside the
// admin chrome) and no auth branching — just the shared "resolving" splash
// while AuthProvider's first /auth/me round-trip is in flight (Story 1.14
// AC #1). Route-level auth guards live in protected-layout.tsx and login.tsx.
import { useAuth } from "@/lib/auth";

export const rootRoute = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { status } = useAuth();

  if (status === "resolving") {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <Outlet />;
}
