/**
 * Web port of apps/mobile/src/lib/auth.tsx (Story 1.6/1.11), adapted for
 * Story 1.14's token-storage decision: the access token lives ONLY in
 * lib/api.ts's module-scoped in-memory variable (never React state, never
 * localStorage/sessionStorage) — this provider never reads or writes it
 * directly, only through setAccessToken/authedRequest. A page reload always
 * starts with no in-memory token; authedRequest's proactive-refresh-on-null
 * branch is what lets a valid refresh_token cookie recover the session.
 */
import type { LoginRequest, LoginResponse, MeResponse } from "@evergreen/shared-types";
import * as React from "react";

import { authedRequest, onSessionExpired, request, setAccessToken, SessionExpiredError } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

export type AuthStatus = "resolving" | "authenticated" | "unauthenticated";

/** Why the session ended, surfaced on the login screen. "expired" when the
 * refresh cookie became invalid/expired/missing (UX-DR27); cleared on
 * sign-in/out and when login unmounts. A fresh load with no session is NOT
 * an expiry and never sets this. */
export type SessionEndReason = "expired" | null;

interface AuthContextValue {
  status: AuthStatus;
  user: MeResponse | null;
  sessionEndReason: SessionEndReason;
  clearSessionEndReason: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * Session lifecycle for Story 1.14 (mirrors Story 1.6's mobile FR8 shape).
 *
 * Resolution rules:
 * - GET /auth/me succeeds (authedRequest refreshes via the httpOnly cookie
 *   when there's no in-memory access token yet) → authenticated.
 * - SessionExpiredError (no valid cookie, or refresh 401/403) → unauthenticated.
 * - 429 on refresh / network loss → unauthenticated for THIS load without
 *   destroying anything (there's nothing client-side to destroy — the cookie
 *   is server-held and untouched) — the next reload/retry can recover.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("resolving");
  const [user, setUser] = React.useState<MeResponse | null>(null);
  const [sessionEndReason, setSessionEndReason] =
    React.useState<SessionEndReason>(null);

  // Mirror of `status` readable from the expiry notifier subscribed once —
  // lets the session-expiry transition happen exactly once (a late 401 from
  // an in-flight request is ignored once already unauthenticated).
  const statusRef = React.useRef<AuthStatus>("resolving");
  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const resolveSession = React.useCallback(async () => {
    try {
      const me = await authedRequest<MeResponse>("/auth/me");
      setUser(me);
      setStatus("authenticated");
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        setAccessToken(null);
      }
      // 429 / NetworkError / unexpected 5xx: nothing client-side to roll
      // back — just don't enter an authenticated state we can't prove.
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  React.useEffect(() => {
    // Deferred out of the synchronous effect body: the state updates happen
    // asynchronously after the /auth/me round-trip, and the rule
    // react-hooks/set-state-in-effect can't prove that across the async
    // call (same pattern as apps/mobile/src/lib/auth.tsx).
    const timer = setTimeout(() => void resolveSession(), 0);
    return () => clearTimeout(timer);
  }, [resolveSession]);

  // Single owner of the session-expiry UI transition (UX-DR27, mirrors
  // Story 1.11). Only fires the "Your session ended" banner when a
  // PREVIOUSLY confirmed session's background refresh fails — i.e.
  // status is "authenticated" already. Deliberately excludes "resolving":
  // unlike mobile (which only reaches doRefresh's network call if a
  // keychain token actually existed), authedRequest's mount-time check
  // always attempts a refresh here since there's nothing persisted to
  // check first — a plain first-ever visit with no refresh_token cookie
  // hits this same 401 path, and must NOT be shown as an "expired"
  // session (resolveSession's own catch already handles that case
  // silently, no banner). Code-review finding, 2026-08-24.
  React.useEffect(() => {
    return onSessionExpired(() => {
      const current = statusRef.current;
      if (current !== "authenticated") return;

      setAccessToken(null);
      queryClient.clear();
      setUser(null);
      setSessionEndReason("expired");
      setStatus("unauthenticated");
    });
  }, []);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const body: LoginRequest = { email, password };
    const data = await request<LoginResponse>("/auth/login", {
      method: "POST",
      body,
    });

    // Only the access token is kept — the refresh token from this body is
    // deliberately discarded, the httpOnly cookie is the only persistence
    // for it (Story 1.14 Dev Notes).
    setAccessToken(data.accessToken);
    setSessionEndReason(null);
    setStatus("authenticated");
    try {
      const me = await authedRequest<MeResponse>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  const signOut = React.useCallback(async () => {
    // Fire-and-forget: the API clears the refresh cookie server-side, but
    // even if this call fails/times out, clearing the in-memory access
    // token below is what actually ends the session on this client.
    request<void>("/auth/logout", { method: "POST" }).catch(() => {});
    setSessionEndReason(null);
    setAccessToken(null);
    queryClient.clear();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const clearSessionEndReason = React.useCallback(() => {
    setSessionEndReason(null);
  }, []);

  const value = React.useMemo(
    () => ({ status, user, sessionEndReason, clearSessionEndReason, signIn, signOut }),
    [status, user, sessionEndReason, clearSessionEndReason, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
