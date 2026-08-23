import { QueryClient } from "@tanstack/react-query";

// TanStack Query data layer (AD-16) — the persisted AsyncStorage-backed
// cache from apps/mobile is a mobile-only concern; the portal reads fresh
// on every load.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
    },
  },
});
