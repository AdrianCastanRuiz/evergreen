# Review 17 — Blind Hunter

You are the **Blind Hunter** reviewer. You receive ONLY the diff below — no spec, no context documents, no project access. Review it adversarially as if hunting for bugs an author would miss. Do not read any files on disk; the diff is your only input.

Review focus:
- Logic errors: wrong condition, off-by-one, inverted branch, swallowed errors.
- Concurrency / race conditions in the single-flight refresh (`refreshPromise`), token save/clear ordering, and state transitions in `AuthProvider`.
- Error-handling gaps: unhandled rejections, paths that crash, double-firing of effects.
- Security / correctness issues: tokens leaking into logs or plain storage, request/response type mismatches, insecure defaults.
- Anything that looks dead code, misleading comments, or an incomplete implementation.

Produce a findings report. For each finding give:
- **Severity**: critical / major / minor / nit
- **File**:line
- **What**: the problem
- **Why it matters**
- **Suggested fix** (concrete)

If you find no issues in a category, say so explicitly. Do not invent issues — only report what you can defend from the diff.

---

```diff
warning: in the working copy of 'apps/mobile/src/app/_layout.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/mobile/src/app/index.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/mobile/src/lib/api.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/mobile/src/lib/keychain.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/mobile/src/app/home.tsx', LF will be replaced by CRLF the next time Git touches it
diff --git a/apps/mobile/src/app/_layout.tsx b/apps/mobile/src/app/_layout.tsx
index 4998cde..3f1b2d4 100644
--- a/apps/mobile/src/app/_layout.tsx
+++ b/apps/mobile/src/app/_layout.tsx
@@ -8,6 +8,7 @@ import { SafeAreaProvider } from "react-native-safe-area-context";
 
 import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
 
+import { AuthProvider } from "@/lib/auth";
 import { queryClient, queryPersister } from "@/lib/query-client";
 
 // Expo only inlines process.env.EXPO_PUBLIC_* into the client bundle —
@@ -16,6 +17,12 @@ if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
   Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, enabled: true });
 }
 
+// DESIGN.md fonts (Roboto/Oswald/Open Sans/Raleway) are declared as NativeWind
+// tokens but not bundled as assets. Loading them requires a font source
+// decision (@expo-google-fonts vs local .ttf) that is Ask-First per the frozen
+// spec-17 — pending human approval, so nothing is loaded here and the hero
+// classes fall back to the system sans font.
+
 export default function RootLayout() {
   return (
     <GestureHandlerRootView style={{ flex: 1 }}>
@@ -24,10 +31,12 @@ export default function RootLayout() {
           client={queryClient}
           persistOptions={{ persister: queryPersister }}
         >
-          <Stack screenOptions={{ headerShown: false }}>
-            <Stack.Screen name="index" />
-          </Stack>
-          <StatusBar style="auto" />
+          <AuthProvider>
+            <Stack screenOptions={{ headerShown: false }}>
+              <Stack.Screen name="index" />
+            </Stack>
+            <StatusBar style="auto" />
+          </AuthProvider>
         </PersistQueryClientProvider>
       </SafeAreaProvider>
     </GestureHandlerRootView>
diff --git a/apps/mobile/src/app/home.tsx b/apps/mobile/src/app/home.tsx
new file mode 100644
index 0000000..75f3792
--- /dev/null
+++ b/apps/mobile/src/app/home.tsx
@@ -0,0 +1,20 @@
+import { Text, View } from "react-native";
+
+import { useAuth } from "@/lib/auth";
+
+// Role-appropriate home target of the splash resolution (FR8). Story 1.10
+// replaces this placeholder with real role-based navigation.
+export default function HomeScreen() {
+  const { user } = useAuth();
+
+  return (
+    <View className="flex-1 items-center justify-center bg-background px-gutter">
+      <Text className="font-heading text-2xl font-semibold text-foreground">
+        {user?.name ?? "Welcome"}
+      </Text>
+      <Text className="mt-2 text-center text-muted-foreground">
+        Role-based navigation is coming soon.
+      </Text>
+    </View>
+  );
+}
diff --git a/apps/mobile/src/app/index.tsx b/apps/mobile/src/app/index.tsx
index 78f7434..d3835e7 100644
--- a/apps/mobile/src/app/index.tsx
+++ b/apps/mobile/src/app/index.tsx
@@ -1,14 +1,29 @@
+import { Redirect } from "expo-router";
 import { Text, View } from "react-native";
 
-// Placeholder root screen. Story 1.6 replaces this with the splash →
-// auth-resolution flow; this screen exists so the navigation tree is valid
-// before any auth screens land.
+import { useAuth } from "@/lib/auth";
+
+// Splash / auth-resolution entry point (FR8): shows the splash while the
+// AuthProvider resolves the keychain session, then redirects by auth state —
+// login (no session), onboarding (family), or home (every other role).
+// Onboarding (Story 1.8) and role-based navigation (Story 1.10) will replace
+// the placeholder targets.
 export default function IndexScreen() {
-  return (
-    <View className="flex-1 items-center justify-center bg-background">
-      <Text className="font-hero text-[34px] font-semibold leading-[39px] tracking-[-0.01em] text-foreground">
-        Evergreen
-      </Text>
-    </View>
-  );
+  const { status, user } = useAuth();
+
+  if (status === "resolving") {
+    return (
+      <View className="flex-1 items-center justify-center bg-background">
+        <Text className="font-hero text-[34px] font-semibold leading-[39px] tracking-[-0.01em] text-foreground">
+          Evergreen
+        </Text>
+   warning: in the working copy of 'apps/mobile/src/app/login.tsx', LF will be replaced by CRLF the next time Git touches it
   </View>
+    );
+  }
+
+  if (status === "unauthenticated") {
+    return <Redirect href="/login" />;
+  }
+
+  return <Redirect href={user?.role === "family" ? "/onboarding" : "/home"} />;
 }
diff --git a/apps/mobile/src/app/login.tsx b/apps/mobile/src/app/login.tsx
new file mode 100644
index 0000000..11ebc23
--- /dev/null
+++ b/apps/mobile/src/app/login.tsx
@@ -0,0 +1,118 @@
+import * as React from "react";
+import {
+  ActivityIndicator,
+  KeyboardAvoidingView,
+  Platform,
+  ScrollView,
+  Text as RNText,
+} from "react-native";
+
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Text } from "@/components/ui/text";
+import { ApiError, NetworkError } from "@/lib/api";
+import { useAuth } from "@/lib/auth";
+
+// Login screen (FR2). The greeting uses the hero typography token per
+// DESIGN.md ({typography.hero} — Roboto 600/34px). Errors are inline and
+// scoped: invalid credentials (401), rate limit (429 — human message, never
+// auto-retry), and network loss (inputs preserved for a retry without
+// re-typing). No token is issued on any failure.
+export default function LoginScreen() {
+  const { signIn } = useAuth();
+  const [email, setEmail] = React.useState("");
+  const [password, setPassword] = React.useState("");
+  const [submitting, setSubmitting] = React.useState(false);
+  const [error, setError] = React.useState<string | null>(null);
+
+  const handleSubmit = async () => {
+    if (submitting) return;
+    setSubmitting(true);
+    setError(null);
+    try {
+      await signIn(email, password);
+    } catch (err) {
+      if (err instanceof ApiError) {
+        if (err.status === 429) {
+          setError(
+            "Too many attempts. Please wait a minute and try again.",
+          );
+        } else if (err.status === 401) {
+          setError("Invalid email or password");
+        } else {
+          setError("Something went wrong. Please try again.");
+        }
+      } else if (err instanceof NetworkError) {
+        setError("No network connection. Check your connection and try again.");
+      } else {
+        setError("Something went wrong. Please try again.");
+      }
+    } finally {
+      setSubmitting(false);
+    }
+  };
+
+  return (
+    <KeyboardAvoidingView
+      className="flex-1 bg-background"
+      behavior={Platform.OS === "ios" ? "padding" : undefined}
+    >
+      <ScrollView
+        contentContainerClassName="flex-1 justify-center px-gutter py-8"
+        keyboardShouldPersistTaps="handled"
+      >
+        <Text className="font-hero text-[34px] font-semibold leading-[39px] tracking-[-0.01em] text-foreground">
+          Welcome to Evergreen
+        </Text>
+        <Text className="mt-2 text-muted-foreground">
+          Sign in to see your care home updates.
+        </Text>
+
+        <RNText className="mt-8 text-sm font-body font-medium text-foreground">
+          Email
+        </RNText>
+        <Input
+          className="mt-2"
+          value={email}
+          onChangeText={setEmail}
+          placeholder="you@example.com"
+          autoCapitalize="none"
+          autoCorrect={false}
+          keyboardType="email-address"
+          autoComplete="email"
+          editable={!submitting}
+        />
+
+        <RNText className="mt-4 text-sm font-body font-medium text-foreground">
+          Password
+        </RNText>
+        <Input
+          className="mt-2"
+          value={password}
+          onChangeText={setPassword}
+          placeholder="Your password"
+          secureTextEntry
+          autoComplete="password"
+          editable={!submitting}
+        />
+
+        {error ? (
+          <Text className="mt-4 text-destructive">{error}</Text>
+        ) : null}
+
+        <Button
+          className="mt-8"
+          size="lg"
+          disabled={submitting}
+          onPress={handleSubmit}
+        >
+          {submitting ? (
+            <ActivityIndicator className="text-primary-foreground" />
+          ) : (
+            <Text>Sign in</Text>
+          )}
+ warning: in the working copy of 'apps/mobile/src/app/onboarding.tsx', LF will be replaced by CRLF the next time Git touches it
       </Button>
+      </ScrollView>
+    </KeyboardAvoidingView>
+  );
+}
diff --git a/apps/mobile/src/app/onboarding.tsx b/apps/mobile/src/app/onboarding.tsx
new file mode 100644
index 0000000..a64d85c
--- /dev/null
+++ b/apps/mobile/src/app/onboarding.tsx
@@ -0,0 +1,20 @@
+import { Text, View } from "react-native";
+
+import { useAuth } from "@/lib/auth";
+
+// Family landing target of the splash resolution (FR8). Story 1.8 replaces
+// this placeholder with the real invite-code onboarding flow.
+export default function OnboardingScreen() {
+  const { user } = useAuth();
+
+  return (
+    <View className="flex-1 items-center justify-center bg-background px-gutter">
+      <Text className="font-heading text-2xl font-semibold text-foreground">
+        Welcome{user?.name ? `, ${user.name}` : ""}
+      </Text>
+      <Text className="mt-2 text-center text-muted-foreground">
+        Your family onboarding is coming soon.
+      </Text>
+    </View>
+  );
+}
diff --git a/apps/mobile/src/lib/api.ts b/apps/mobile/src/lib/api.ts
index e06c491..82bcb02 100644
--- a/apps/mobile/src/lib/api.ts
+++ b/apps/mobile/src/lib/api.ts
@@ -1,4 +1,6 @@
-import type { ApiErrorBody } from "@evergreen/shared-types";
+import type { LoginResponse, RefreshRequest } from "@evergreen/shared-types";
+
+import { loadTokens, saveTokens } from "@/lib/keychain";
 
 export const API_BASE_URL =
   process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
@@ -6,7 +8,9 @@ export const API_BASE_URL =
 /**
  * Typed client error raised for any non-2xx HTTP response. `code`/`message`
  * come from the API's `{ error: { code, message, details? } }` envelope
- * (Consistency Conventions in ARCHITECTURE-SPINE.md); `status` is the raw
+ * (Consistency Conventions in ARCHITECTURE-SPINE.md) or, when the backend
+ * responds with NestJS's native `{ statusCode, message }` shape (it does for
+ * login/refresh/me today), from those top-level fields. `status` is the raw
  * HTTP status so callers can branch on 429/401 without string-matching.
  */
 export class ApiError extends Error {
@@ -33,6 +37,19 @@ export class NetworkError extends Error {
   }
 }
 
+/**
+ * Raised when the refresh token is gone or no longer valid (401/403 on
+ * POST /auth/refresh). The session cannot be recovered: `AuthProvider`
+ * clears the keychain and flips to `unauthenticated`. The explicit
+ * session-expiry UI is Story 1.11; here it only means "no token survives".
+ */
+export class SessionExpiredError extends Error {
+  constructor(message = "Your session has expired") {
+    super(message);
+    this.name = "SessionExpiredError";
+  }
+}
+
 export interface RequestOptions {
   method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
   body?: unknown;
@@ -72,18 +89,28 @@ export async function request<T>(
   }
 
   if (!response.ok) {
-    let errorBody: ApiErrorBody | undefined;
+    let code = "unknown_error";
+    let message = response.statusText;
+    let details: unknown;
     try {
-      errorBody = (await response.json()) as ApiErrorBody;
+      // Accepts both the shared-types envelope ({ error: { code, message } })
+      // and NestJS's native error body ({ statusCode, message }), which is
+      // what login/refresh/me actually return.
+      const body = (await response.json()) as {
+        error?: { code?: string; message?: string; details?: unknown };
+        code?: string;
+        message?: string | string[];
+      };
+      const envelope = body?.error;
+      if (envelope?.code) code = envelope.code;
+      else if (body?.code) code = body.code;
+      if (envelope?.message) message = envelope.message;
+      else if (typeof body?.message === "string") message = body.message;
+      if (envelope?.details !== undefined) details = envelope.details;
     } catch {
-      // Non-JSON error body — fall back to the status text.
+      // Non-JSON error body — keep the statusText fallback.
     }
-    throw new ApiError(
-      response.status,
-      errorBody?.error.code ?? "unknown_error",
-      errorBody?.error.message ?? response.statusText,
-      errorBodwarning: in the working copy of 'apps/mobile/src/lib/auth.tsx', LF will be replaced by CRLF the next time Git touches it
y?.error.details,
-    );
+    throw new ApiError(response.status, code, message, details);
   }
 
   // 204 No Content (e.g. POST /auth/logout, /auth/password-reset).
@@ -91,3 +118,75 @@ export async function request<T>(
 
   return (await response.json()) as T;
 }
+
+let refreshPromise: Promise<string> | null = null;
+
+/**
+ * Single-flight token refresh: POST /auth/refresh with the keychain's refresh
+ * token, then persist the fresh pair. Concurrent callers (multiple 401s from
+ * parallel screens) all await the SAME in-flight request instead of minting
+ * several pairs that would race on the keychain writes.
+ *
+ * - 401/403 on refresh → throws SessionExpiredError (caller clears the session).
+ * - 429 on refresh → throws ApiError; the session is NOT destroyed and the
+ *   caller defers the retry (NFR10/AD-8). No auto-retry loop here.
+ */
+export function refreshTokens(): Promise<string> {
+  if (!refreshPromise) {
+    refreshPromise = doRefresh().finally(() => {
+      refreshPromise = null;
+    });
+  }
+  return refreshPromise;
+}
+
+async function doRefresh(): Promise<string> {
+  const tokens = await loadTokens();
+  if (!tokens?.refreshToken) throw new SessionExpiredError();
+
+  let pair: LoginResponse;
+  try {
+    pair = await request<LoginResponse>("/auth/refresh", {
+      method: "POST",
+      body: { refreshToken: tokens.refreshToken } satisfies RefreshRequest,
+    });
+  } catch (err) {
+    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
+      throw new SessionExpiredError(err.message);
+    }
+    // 429 (rate limit) or 5xx / NetworkError: keep the session intact and
+    // propagate so the caller decides whether to defer.
+    throw err;
+  }
+
+  await saveTokens(pair);
+  return pair.accessToken;
+}
+
+/**
+ * Authenticated request with transparent refresh (FR6). Attaches the current
+ * access token from the keychain; on a 401 it performs exactly ONE refresh
+ * and retries the original request once with the fresh token. The retry is
+ * not looped — a second 401 propagates.
+ *
+ * - refresh succeeds → original request retried, screen unchanged.
+ * - refresh 401/403 → SessionExpiredError (session cleared upstream).
+ * - refresh 429 → ApiError with status 429 (screen stays intact, caller
+ *   defers the retry; the session is not destroyed on the spot).
+ */
+export async function authedRequest<T>(
+  path: string,
+  options: RequestOptions = {},
+): Promise<T> {
+  const tokens = await loadTokens();
+  if (!tokens?.accessToken) throw new SessionExpiredError();
+
+  try {
+    return await request<T>(path, { ...options, token: tokens.accessToken });
+  } catch (err) {
+    if (!(err instanceof ApiError) || err.status !== 401) throw err;
+
+    const freshAccessToken = await refreshTokens();
+    return request<T>(path, { ...options, token: freshAccessToken });
+  }
+}
diff --git a/apps/mobile/src/lib/auth.tsx b/apps/mobile/src/lib/auth.tsx
new file mode 100644
index 0000000..fcbf7c6
--- /dev/null
+++ b/apps/mobile/src/lib/auth.tsx
@@ -0,0 +1,100 @@
+import type { LoginRequest, LoginResponse, MeResponse } from "@evergreen/shared-types";
+import * as React from "react";
+
+import { authedRequest, request, SessionExpiredError } from "@/lib/api";
+import { clearTokens, saveTokens } from "@/lib/keychain";
+
+export type AuthStatus = "resolving" | "authenticated" | "unauthenticated";
+
+interface AuthContextValue {
+  status: AuthStatus;
+  user: MeResponse | null;
+  signIn: (email: string, password: string) => Promise<void>;
+  signOut: () => Promise<void>;
+}
+
+const AuthContext = React.createContext<AuthContextValue | null>(null);
+
+/**
+ * Session lifecycle for Story 1.6 (FR8). Tokens are persisted ONLY in the
+ * platform keychain (NFR8, AD-8) and read back from there on every request —
+ * this context never holds them in state, so it cannot drift from storage.
+ *
+ * Resolution rules:
+ * - No tokens in keychain → unauthenticated.
+ * - GET /auth/me succeeds (authedRequest refreshes a stale access token
+ *   automatically) → authenticated with the resolved user.
+ * - SessionExpiredError (refresh unrecoverable) → clear keychain, unauthenticated.
+ * - 429 on refresh / network loss → KEEP the tokens (the session survives;
+ *   it will be re-resolved on the next launch or after the user retries) and
+ *   surface as unauthenticated — never destroy the session on the spot
+ *   (NFR10, AD-8).
+ */
+export function AuthProvider({ children }: { children: React.ReactNode }) {
+  const [status, setStatus] = React.useState<AuthStatus>("resolving");
+  const [user, setUser] = React.useState<MeResponse | null>(null);
+
+  const resolveSession = React.useCallback(async () => {
+    try {
+      const me = await authedRequest<MeResponse>("/auth/me");
+      setUser(me);
+      setStatus("authenticated");
+    } catch (err) {
+      if (err instanceof SessionExpiredError) {
+        await clearTokens().catch(() => {});
+      }
+      // 429 / NetworkError / unexpected 5xx: leave the tokens in the keychain
+      // so the session can be re-resolved later; just don't enter an
+      // authenticated state we can't prove.
+      setUser(null);
+      setStatus("unauthenticated");
+    }
+  }, []);
+
+  React.useEffect(() => {
+    // Deferred out of the synchronous effect body: the state updates happen
+    // asynchronously after the /auth/me round-trip, and the rule
+    // react-hooks/set-state-in-effect can't prove that across the async call.
+    const timer = setTimeout(() => void resolveSession(), 0);
+    return () => clearTimeout(timer);
+  }, [resolveSession]);
+
+  const signIn = React.useCallback(async (email: string, password: string) => {
+    const body: LoginRequest = { email, password };
+    const tokens = await request<LoginResponse>("/auth/login", {
+      method: "POST",
+      body,
+    });
+
+    await saveTokens(tokens);
+    // Resolve the user best-effort; if the call fails, index routes to the
+    // home placeholder and the session is re-resolved on the next launch.
+    // Only errors thrown BEFORE this point (login itself) reach the form.
+    setStatus("authenticated");
+    try {
+      const me = await authedRequest<MeResponse>("/auth/me");
+      setUser(me);
+    } catch {
+      setUser(null);
+    }
+  }, []);
+
+  const signOut = React.useCallback(async () => {
+    await clearTokens().catch(() => {});
+    setUser(null);
+    setStatus("unauthenticated");
+  }, []);
+
+  const value = React.useMemo(
+    () => ({ status, user, signIn, signOut }),
+    [status, user, signIn, signOut],
+  );
+
+  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
+}
+
+export function useAuth(): AuthContextValue {
+  const ctx = React.useContext(AuthContext);
+  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
+  return ctx;
+}
diff --git a/apps/mobile/src/lib/keychain.ts b/apps/mobile/src/lib/keychain.ts
index c9223c0..8f65ca1 100644
--- a/apps/mobile/src/lib/keychain.ts
+++ b/apps/mobile/src/lib/keychain.ts
@@ -12,11 +12,18 @@ export interface TokenPair {
   refreshToken: string;
 }
 
+// Sequential writes, not Promise.all: a real token pair must never be
+// half-written. If the refresh-token write fails after the access token was
+// written, both are deleted so the keychain holds either a full pair or
+// nothing — never a dangling access token with a stale/missing refresh token.
 export async function saveTokens(pair: TokenPair): Promise<void> {
-  await Promise.all([
-    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, pair.accessToken),
-    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, pair.refreshToken),
-  ]);
+  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, pair.accessToken);
+  try {
+    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, pair.refreshToken);
+  } catch (err) {
+    await clearTokens().catch(() => {});
+    throw err;
+  }
 }
 
 export async function loadTokens(): Promise<TokenPair | null> {

```
