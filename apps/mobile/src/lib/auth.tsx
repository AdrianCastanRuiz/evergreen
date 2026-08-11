import type { LoginRequest, LoginResponse, MeResponse } from "@evergreen/shared-types";
import * as React from "react";

import { authedRequest, request, SessionExpiredError } from "@/lib/api";
import { clearTokens, saveTokens } from "@/lib/keychain";

export type AuthStatus = "resolving" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: MeResponse | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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
    setStatus("authenticated");
    try {
      const me = await authedRequest<MeResponse>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  const signOut = React.useCallback(async () => {
    await clearTokens().catch(() => {});
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = React.useMemo(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
