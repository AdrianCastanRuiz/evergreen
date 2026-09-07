import type { LinkedResident } from "@evergreen/shared-types";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { authedRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Story 2.3 (Task 3, AC #3): holds the family member's linked-residents list
// (fetched via TanStack Query per AD-16) and the currently-active resident id.
// Session-scoped, in-memory only — the "persists across foreground/background"
// requirement in AC #3 is within the session, NOT across app restarts, so we
// deliberately do NOT persist to AsyncStorage/expo-secure-store (that would
// over-scope this AC). Staff/admin never mount this provider, so they never
// hold resident state that is meaningless for them.
//
// Mirrors apps/mobile/src/lib/auth.tsx's context + hook pattern (AuthProvider
// / useAuth). The fetch itself is the family's own self-scoped endpoint
// (GET /residents/linked) — the backend derives the caller from the token.

export const linkedResidentsQueryKey = ["linkedResidents"] as const;

interface ResidentContextValue {
  /** The caller's own linked residents (empty array for zero-links). */
  residents: LinkedResident[] | undefined;
  /** True while the first fetch is in flight (no cached data yet). */
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /** The currently-active resident id; undefined until residents resolve. */
  activeResidentId: string | undefined;
  setActiveResidentId: (id: string) => void;
}

const ResidentContext = React.createContext<ResidentContextValue | null>(null);

export function ResidentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status, user } = useAuth();

  // Default the active resident to the first link once the list arrives (and
  // keep a valid selection whenever links change, e.g. a link removed while
  // the app is open). Stored as state so the Home/Photos/Events/Menu tabs can
  // re-scope to it (Story 2.3 AC #3); undefined while loading.
  const [activeResidentId, setActiveResidentId] = React.useState<
    string | undefined
  >(undefined);

  const {
    data: residents,
    isLoading,
    error,
    refetch,
  } = useQuery({
    // Only for an authenticated FAMILY user: this endpoint is @Roles('family'),
    // so staff/admin would 403 (and pollute the cache) if enabled for them.
    // Mounted once in RootLayout but dormant outside the family dashboard.
    enabled: status === "authenticated" && user?.role === "family",
    queryKey: linkedResidentsQueryKey,
    queryFn: () => authedRequest<LinkedResident[]>("/residents/linked"),
  });

  // Reconcile the active selection whenever the list resolves. Deferred out of
  // the synchronous effect body (same pattern as auth.tsx's splash resolve):
  // the rule react-hooks/set-state-in-effect can't prove the update is safe
  // across the callback, so it's scheduled. The functional update reads the
  // latest selection without a ref/memo, so no stale-capture bug.
  React.useEffect(() => {
    if (residents === undefined) return;
    const timer = setTimeout(() => {
      setActiveResidentId((current) => {
        if (residents.length === 0) return undefined;
        if (current && residents.some((r) => r.id === current)) return current;
        return residents[0].id;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [residents]);

  const value = React.useMemo(
    () => ({
      residents,
      isLoading,
      error,
      refetch,
      activeResidentId,
      setActiveResidentId,
    }),
    [residents, isLoading, error, refetch, activeResidentId],
  );

  return (
    <ResidentContext.Provider value={value}>
      {children}
    </ResidentContext.Provider>
  );
}

export function useResidents(): ResidentContextValue {
  const ctx = React.useContext(ResidentContext);
  if (!ctx) {
    throw new Error("useResidents must be used within ResidentProvider");
  }
  return ctx;
}