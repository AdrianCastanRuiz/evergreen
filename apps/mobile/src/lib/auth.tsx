import type { LoginRequest, LoginResponse, MeResponse } from "@evergreen/shared-types";
import * as React from "react";

import { authedRequest, onSessionExpired, request, SessionExpiredError } from "@/lib/api";
import { clearTokens, saveTokens } from "@/lib/keychain";
import { queryClient } from "@/lib/query-client";

export type AuthStatus = "resolving" | "authenticated" | "unauthenticated";

/**
 * Why the session ended, surfaced on the login screen. `"expired"` when the
 * refresh token became invalid/expired (UX-DR27); cleared on sign-in/out and
 * when login unmounts. A fresh launch with an empty keychain is NOT an expiry
 * and never sets this.
 */
export type SessionEndReason = "expired" | null;

interface AuthContextValue {
  status: AuthStatus;
  user: MeResponse | null;
  sessionEndReason: SessionEndReason;
  clearSessionEndReason: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Story 1.9: pushes a fresh MeResponse (e.g. PATCH /auth/me's own
   * response) into context so every consumer (profile screen, home's
   * greeting) reflects the change immediately, without a second round trip. */
  updateUser: (user: MeResponse) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * Session lifecycle for Story 1.6 (FR8). Tokens are persisted ONLY in the
 * platform keychain (NFR8, AD-8) and read back from there on every request —
 * this context never holds them in state, so it cannot drift from storage.
 *
 * Resolution rules:
 * - No tokens in keychain → unauthenticated.
 * - GET /auth/me succeeds (authedRequest refreshes a stale access token
 *   automatically) → authenticated with the resolved user.
 * - SessionExpiredError (refresh unrecoverable) → clear keychain, unauthenticated.
 * - 429 on refresh / network loss → KEEP the tokens (the session survives;
 *   it will be re-resolved on the next launch or after the user retries) and
 *   surface as unauthenticated — never destroy the session on the spot
 *   (NFR10, AD-8).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("resolving");
  const [user, setUser] = React.useState<MeResponse | null>(null);
  const [sessionEndReason, setSessionEndReason] =
    React.useState<SessionEndReason>(null);

  // Mirror of `status` readable from the expiry notifier subscribed once. Lets
  // AuthProvider perform the session-expiry transition exactly once: after it
  // flips to unauthenticated, a late 401 from an in-flight request is ignored.
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
        await clearTokens().catch(() => {});
      }
      // 429 / NetworkError / unexpected 5xx: leave the tokens in the keychain
      // so the session can be re-resolved later; just don't enter an
      // authenticated state we can't prove.
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  React.useEffect(() => {
    // Deferred out of the synchronous effect body: the state updates happen
    // asynchronously after the /auth/me round-trip, and the rule
    // react-hooks/set-state-in-effect can't prove that across the async call.
    const timer = setTimeout(() => void resolveSession(), 0);
    return () => clearTimeout(timer);
  }, [resolveSession]);

  // Single owner of the session-expiry UI transition (UX-DR27, Story 1.11).
  // A genuine refresh failure is notified by the single-flight refresh bus
  // exactly once; the status ref guarantees only one transition even if a
  // stale in-flight request 401s after we already went unauthenticated.
  React.useEffect(() => {
    return onSessionExpired(() => {
      const current = statusRef.current;
      if (current !== "authenticated" && current !== "resolving") return;

      clearTokens().catch(() => {});
      queryClient.clear();
      setUser(null);
      setSessionEndReason("expired");
      setStatus("unauthenticated");
    });
  }, []);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const body: LoginRequest = { email, password };
    const tokens = await request<LoginResponse>("/auth/login", {
      method: "POST",
      body,
    });

    await saveTokens(tokens);
    // Resolve the user best-effort; if the call fails, index routes to the
    // home placeholder and the session is re-resolved on the next launch.
    // Only errors thrown BEFORE this point (login itself) reach the form.
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
    // Local keychain clear is what actually logs out (stateless JWT); the
    // public logout endpoint is fire-and-forget so an expired access token
    // doesn't block the transition (backend always 204s).
    request<void>("/auth/logout", { method: "POST" }).catch(() => {});
    setSessionEndReason(null);
    await clearTokens().catch(() => {});
    // Drop the day-long persisted query cache so no stale data or future
    // write-queue entry carries over into the next session (AC3).
    queryClient.clear();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const clearSessionEndReason = React.useCallback(() => {
    setSessionEndReason(null);
  }, []);

  const updateUser = React.useCallback((u: MeResponse) => {
    setUser(u);
  }, []);

  const value = React.useMemo(
    () => ({
      status,
      user,
      sessionEndReason,
      clearSessionEndReason,
      signIn,
      signOut,
      updateUser,
    }),
    [status, user, sessionEndReason, clearSessionEndReason, signIn, signOut, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
